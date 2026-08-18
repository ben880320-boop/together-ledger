import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as IntentLauncher from "expo-intent-launcher";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import Svg, { Circle } from "react-native-svg";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text as NativeTextComponent,
  TextInput,
  View,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  api,
  API_BASE_URL,
  clearSessionToken,
  getSessionToken,
  saveSessionToken,
} from "../lib/api";
import { requestExpoPushToken } from "../lib/notifications";

const colors = {
  background: "#FBF7F3",
  surface: "#FFFCF9",
  ink: "#3A2F2B",
  muted: "#927E75",
  border: "#EEE1DA",
  rose: "#B56C78",
  roseSoft: "#F6E5E5",
  burgundy: "#5A3E43",
  sage: "#7E8D70",
  orange: "#C98558",
  blue: "#6D8EA8",
};

type AppearanceTheme =
  | "rose"
  | "cherry"
  | "graphite"
  | "latte"
  | "mint"
  | "ocean"
  | "sunset"
  | "starry"
  | "forest"
  | "meadow"
  | "snow"
  | "lavender";
type AppearanceFont = "system" | "rounded" | "serif" | "clean" | "mono";
type AppearanceScale = "tiny" | "small" | "standard" | "large" | "xl";
type AppearanceCardStyle = "soft" | "outlined" | "flat";
type AppearanceNavStyle = "pill" | "line" | "minimal";
type AppearancePreferences = {
  theme: AppearanceTheme;
  font: AppearanceFont;
  scale: AppearanceScale;
  cardStyle: AppearanceCardStyle;
  navStyle: AppearanceNavStyle;
  compactMode: boolean;
  reduceMotion: boolean;
  autoReceiptNote: boolean;
  autoDownloadUpdatesOnWifi: boolean;
};

type NotificationPreferences = {
  incomeEnabled: number;
  expenseEnabled: number;
  minimumAmount: number;
  monthlySettlementEnabled: number;
  monthlyReminderDay: number;
};

const notificationDefaults: NotificationPreferences = {
  incomeEnabled: 0,
  expenseEnabled: 0,
  minimumAmount: 0,
  monthlySettlementEnabled: 0,
  monthlyReminderDay: 28,
};

const appearanceDefaults: AppearancePreferences = {
  theme: "rose",
  font: "system",
  scale: "standard",
  cardStyle: "soft",
  navStyle: "pill",
  compactMode: false,
  reduceMotion: false,
  autoReceiptNote: true,
  autoDownloadUpdatesOnWifi: true,
};
const appearanceStorageKey = "together-ledger-appearance-v1";
const APP_VERSION = "1.2.8.5";
const GITHUB_REPOSITORY_URL = "https://github.com/ben880320-boop/together-ledger";
const GITHUB_RELEASES_URL = "https://github.com/ben880320-boop/together-ledger/releases";
const GITHUB_LATEST_RELEASE_API = "https://api.github.com/repos/ben880320-boop/together-ledger/releases/latest";
const OFFICIAL_APK_URL_PREFIX = "https://github.com/ben880320-boop/together-ledger/releases/download/";
const APK_MIME_TYPE = "application/vnd.android.package-archive";

type AppUpdateStatus = "idle" | "checking" | "downloading" | "installing";
type GitHubReleaseAsset = { name?: string; browser_download_url?: string };
type GitHubReleasePayload = { tag_name?: string; body?: string; assets?: GitHubReleaseAsset[] };
type AppUpdateRelease = { version: string; notes: string; apkUrl: string };

const formatUpdateMessage = (release: AppUpdateRelease) => {
  const notes = release.notes.length > 420 ? `${release.notes.slice(0, 420)}…` : release.notes;
  const hasSecurityNotes = /安全|security|漏洞|修補|修复|隱私|privacy|權限|permission|認證|authentication|加密/i.test(release.notes);
  const securitySummary = hasSecurityNotes
    ? "此版本的發行說明包含安全性、隱私或權限相關調整，建議儘快完成更新。"
    : "發行說明未標示專屬安全性修正；更新檔仍只會自官方 GitHub Release 下載。";
  return `目前版本：v${APP_VERSION}\n可更新至：v${release.version}\n\n更新內容\n${notes}\n\n安全性摘要\n${securitySummary}\n\n更新檔會直接在 App 內下載，完成後由 Android 系統要求你確認安裝。`;
};

const normalizeNotificationPreferences = (input?: Partial<NotificationPreferences> | Record<string, unknown>): NotificationPreferences => {
  const raw = (input || {}) as Record<string, unknown>;
  const enabled = (...keys: string[]) => keys.some(key => raw[key] === true || raw[key] === 1 || raw[key] === "1");
  const numberAt = (...keys: string[]) => {
    const value = keys.map(key => raw[key]).find(value => value !== undefined && value !== null);
    return Number(value) || 0;
  };
  return {
    incomeEnabled: enabled("incomeEnabled", "income_enabled") ? 1 : 0,
    expenseEnabled: enabled("expenseEnabled", "expense_enabled") ? 1 : 0,
    minimumAmount: Math.max(0, Math.min(100_000_000, Math.trunc(numberAt("minimumAmount", "minimum_amount")))),
    monthlySettlementEnabled: enabled("monthlySettlementEnabled", "monthly_settlement_enabled") ? 1 : 0,
    monthlyReminderDay: Math.max(1, Math.min(28, Math.trunc(numberAt("monthlyReminderDay", "monthly_reminder_day") || 28))),
  };
};

const isVersionNewer = (remote: string, local: string) => {
  const remoteParts = remote.replace(/^v/i, "").split(".").map(part => Number(part) || 0);
  const localParts = local.replace(/^v/i, "").split(".").map(part => Number(part) || 0);
  for (let index = 0; index < Math.max(remoteParts.length, localParts.length, 3); index += 1) {
    const remotePart = remoteParts[index] || 0;
    const localPart = localParts[index] || 0;
    if (remotePart !== localPart) return remotePart > localPart;
  }
  return false;
};

const fetchLatestAndroidRelease = async (): Promise<AppUpdateRelease | null> => {
  const response = await fetch(GITHUB_LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error("暫時無法取得更新資訊，請確認網路後再試一次。");
  const release = (await response.json()) as GitHubReleasePayload;
  const version = release.tag_name?.replace(/^v/i, "");
  const apkUrl = release.assets?.find(asset =>
    asset.name === "together-ledger.apk" &&
    typeof asset.browser_download_url === "string" &&
    asset.browser_download_url.startsWith(OFFICIAL_APK_URL_PREFIX)
  )?.browser_download_url;
  if (!version || !apkUrl) return null;
  return { version, notes: release.body?.trim() || "包含最新功能、修正與穩定性改善。", apkUrl };
};
const appearancePalettes: Record<AppearanceTheme, typeof colors> = {
  rose: colors,
  cherry: {
    ...colors,
    background: "#FFF3F7",
    surface: "#FFF9FB",
    ink: "#50313D",
    muted: "#9B7280",
    border: "#F2D7E1",
    rose: "#CE6D91",
    roseSoft: "#FBE0EA",
    burgundy: "#754353",
    sage: "#839D78",
    orange: "#D28A72",
    blue: "#7E9CB5",
  },
  graphite: {
    ...colors,
    background: "#F4F5F7",
    surface: "#FFFFFF",
    ink: "#252A31",
    muted: "#6B7280",
    border: "#E1E5EA",
    rose: "#58677A",
    roseSoft: "#E8EDF3",
    burgundy: "#303844",
  },
  latte: {
    ...colors,
    background: "#F8F1E8",
    surface: "#FFF9F1",
    ink: "#4A392E",
    muted: "#927765",
    border: "#E8D7C6",
    rose: "#B87955",
    roseSoft: "#F4E1D1",
    burgundy: "#684A3A",
  },
  mint: {
    ...colors,
    background: "#F0F7F4",
    surface: "#FBFFFD",
    ink: "#29443D",
    muted: "#6D8C82",
    border: "#D6E7E0",
    rose: "#4D9381",
    roseSoft: "#DDEFE8",
    burgundy: "#315F55",
    sage: "#5D8B72",
    orange: "#C88D62",
    blue: "#4E8990",
  },
  ocean: {
    ...colors,
    background: "#062638",
    surface: "#103C51",
    ink: "#F2FBFF",
    muted: "#B4D2DE",
    border: "#286278",
    rose: "#62C4D8",
    roseSoft: "#164F66",
    burgundy: "#C9F5FF",
    sage: "#568B78",
    orange: "#C88A5F",
    blue: "#397D9B",
  },
  sunset: {
    ...colors,
    background: "#FFF7EF",
    surface: "#FFFCF7",
    ink: "#4B3029",
    muted: "#9A7468",
    border: "#F0DCCB",
    rose: "#D17B61",
    roseSoft: "#FBE4D9",
    burgundy: "#75473B",
    sage: "#7C946D",
    orange: "#D17B61",
    blue: "#758BA4",
  },
  starry: {
    ...colors,
    background: "#060A1D",
    surface: "#111A39",
    ink: "#F4F6FF",
    muted: "#BBC5E9",
    border: "#31436E",
    rose: "#AFA4FF",
    roseSoft: "#242553",
    burgundy: "#E6E4FF",
    sage: "#6B9A9A",
    orange: "#C58B62",
    blue: "#5E78B5",
  },
  forest: {
    ...colors,
    background: "#F1F7F0",
    surface: "#FCFFFB",
    ink: "#294233",
    muted: "#6F8874",
    border: "#D8E8D7",
    rose: "#5A956F",
    roseSoft: "#E0F0E1",
    burgundy: "#365C46",
    sage: "#5C9568",
    orange: "#C38C5C",
    blue: "#568A92",
  },
  meadow: {
    ...colors,
    background: "#F4F7E8",
    surface: "#FDFFF8",
    ink: "#39452A",
    muted: "#7E8B69",
    border: "#DDE7C9",
    rose: "#7B9B43",
    roseSoft: "#E5F0CC",
    burgundy: "#526734",
    sage: "#81A66B",
    orange: "#D1A44B",
    blue: "#7A9AAA",
  },
  snow: {
    ...colors,
    background: "#E9F2F8",
    surface: "#F9FCFF",
    ink: "#29404F",
    muted: "#6D8798",
    border: "#D5E4EF",
    rose: "#5A8BA5",
    roseSoft: "#E1EEF6",
    burgundy: "#375A71",
    sage: "#7197A3",
    orange: "#B98A66",
    blue: "#6395B5",
  },
  lavender: {
    ...colors,
    background: "#F7F1FB",
    surface: "#FFFCFF",
    ink: "#43354E",
    muted: "#887A93",
    border: "#E9DDF0",
    rose: "#9C6BB3",
    roseSoft: "#F0E3F6",
    burgundy: "#64456F",
    sage: "#79A08A",
    orange: "#C9906B",
    blue: "#7184B1",
  },
};

const appearanceScaleMap: Record<AppearanceScale, number> = {
  tiny: 0.82,
  small: 0.9,
  standard: 1,
  large: 1.12,
  xl: 1.25,
};
const appearanceFontMap: Record<AppearanceFont, string> = {
  system: Platform.select({ android: "sans-serif", ios: "System" }) || "sans-serif",
  rounded:
    Platform.select({ android: "sans-serif-rounded", ios: "System" }) ||
    "sans-serif",
  serif: Platform.select({ android: "serif", ios: "Times New Roman" }) || "serif",
  clean: Platform.select({ android: "sans-serif-condensed", ios: "System" }) || "sans-serif",
  mono: Platform.select({ android: "monospace", ios: "Menlo" }) || "monospace",
};

type AppearanceContextValue = {
  preferences: AppearancePreferences;
  palette: typeof colors;
  updatePreferences: (patch: Partial<AppearancePreferences>) => void;
};
const AppearanceContext = createContext<AppearanceContextValue>({
  preferences: appearanceDefaults,
  palette: colors,
  updatePreferences: () => undefined,
});

function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(
    appearanceDefaults
  );
  useEffect(() => {
    AsyncStorage.getItem(appearanceStorageKey).then(value => {
      if (!value) return;
      try {
        const saved = JSON.parse(value) as Partial<AppearancePreferences>;
        setPreferences({ ...appearanceDefaults, ...saved });
      } catch {
        // Ignore malformed local preferences and keep the defaults.
      }
    });
  }, []);
  const updatePreferences = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      setPreferences(current => {
        const next = { ...current, ...patch };
        void AsyncStorage.setItem(appearanceStorageKey, JSON.stringify(next));
        return next;
      });
    },
    []
  );
  const value = useMemo(
    () => ({
      preferences,
      palette: appearancePalettes[preferences.theme],
      updatePreferences,
    }),
    [preferences, updatePreferences]
  );
  styles = createStyles(value.palette, preferences);
  return (
    <AppearanceContext.Provider value={value}>
      <View style={{ flex: 1, backgroundColor: value.palette.background }}>
        {children}
      </View>
    </AppearanceContext.Provider>
  );
}
function useAppearance() {
  return useContext(AppearanceContext);
}

const starPositions = [
  [7, 8, 2], [18, 17, 3], [33, 6, 2], [46, 12, 4], [59, 4, 2], [75, 18, 3], [89, 8, 2],
  [11, 31, 3], [28, 39, 2], [42, 27, 2], [56, 43, 4], [67, 32, 2], [82, 45, 3], [94, 29, 2],
] as const;

const petalPositions = [
  [6, 14, 9, -18], [21, 6, 7, 26], [36, 21, 10, 8], [51, 10, 6, -35],
  [67, 26, 8, 32], [82, 11, 10, -12], [92, 36, 7, 28], [15, 48, 8, 16],
] as const;

const snowPositions = [
  [8, 16, 5], [24, 8, 3], [39, 28, 5], [55, 10, 4], [71, 24, 3], [88, 12, 5],
  [15, 42, 3], [34, 49, 4], [61, 43, 5], [83, 55, 3],
] as const;

function ThemeAtmosphere() {
  const { preferences } = useAppearance();
  const glow = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (preferences.theme !== "starry" || preferences.reduceMotion) {
      glow.stopAnimation();
      glow.setValue(0.75);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.28, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [glow, preferences.reduceMotion, preferences.theme]);
  const sceneContainer = { ...StyleSheet.absoluteFillObject, overflow: "hidden" as const };
  if (preferences.theme === "rose") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: "#F2CDD4", opacity: 0.34, top: -132, left: -95 }} />
      <View style={{ position: "absolute", width: 210, height: 130, borderRadius: 100, borderWidth: 18, borderColor: "#EEC5CD", opacity: 0.28, right: -72, bottom: 96, transform: [{ rotate: "-18deg" }] }} />
      <View style={{ position: "absolute", width: "140%", height: 170, borderRadius: 150, backgroundColor: "#F7E2DD", opacity: 0.55, bottom: -104, left: "-20%", transform: [{ rotate: "4deg" }] }} />
    </View>;
  }
  if (preferences.theme === "cherry") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 28, height: 330, borderRadius: 18, backgroundColor: "#654351", opacity: 0.62, top: -42, left: 42, transform: [{ rotate: "-13deg" }] }} />
      <View style={{ position: "absolute", width: 262, height: 15, borderRadius: 12, backgroundColor: "#734958", opacity: 0.68, top: 58, left: -30, transform: [{ rotate: "24deg" }] }} />
      <View style={{ position: "absolute", width: 166, height: 11, borderRadius: 10, backgroundColor: "#8E5A67", opacity: 0.58, top: 106, left: 28, transform: [{ rotate: "-27deg" }] }} />
      {[[4, 4, 74], [19, 1, 66], [36, 8, 70], [55, 0, 60], [73, 7, 68]].map(([left, top, size], index) => <View key={`blossom-${left}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: size, height: size * 0.68, borderRadius: size, backgroundColor: index % 2 ? "#F6B1C5" : "#F8C8D7", opacity: 0.56 }} />)}
      {petalPositions.map(([left, top, size, rotation], index) => <View key={`${left}-${top}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: size, height: Math.max(5, size - 2), borderRadius: size, backgroundColor: index % 2 ? "#E989AF" : "#FAD0DC", opacity: 0.88, transform: [{ rotate: `${rotation}deg` }] }} />)}
      <View style={{ position: "absolute", width: "145%", height: 92, bottom: -35, left: "-24%", borderRadius: 120, backgroundColor: "#A5C28F", opacity: 0.48 }} />
      <View style={{ position: "absolute", width: "145%", height: 98, bottom: -76, left: "-14%", borderRadius: 120, backgroundColor: "#F9DDE7", opacity: 0.76 }} />
    </View>;
  }
  if (preferences.theme === "graphite") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 205, height: 205, borderRadius: 105, borderWidth: 28, borderColor: "#DCE2EA", opacity: 0.55, top: -115, right: -54 }} />
      {[28, 52, 76].map(offset => <View key={offset} style={{ position: "absolute", height: 1, width: "115%", left: "-8%", top: `${offset}%`, backgroundColor: "#D2D9E2", opacity: 0.52, transform: [{ rotate: "-12deg" }] }} />)}
      <View style={{ position: "absolute", width: "145%", height: 135, bottom: -82, left: "-19%", borderRadius: 130, backgroundColor: "#E6EBF0", opacity: 0.72 }} />
    </View>;
  }
  if (preferences.theme === "latte") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 205, height: 205, borderRadius: 105, borderWidth: 23, borderColor: "#E7CAB4", opacity: 0.44, top: -92, right: -48 }} />
      <View style={{ position: "absolute", width: 128, height: 56, borderRadius: 70, borderTopWidth: 9, borderColor: "#D6A987", opacity: 0.31, left: -18, top: 112, transform: [{ rotate: "-20deg" }] }} />
      <View style={{ position: "absolute", width: "135%", height: 128, bottom: -69, left: "-16%", borderRadius: 120, backgroundColor: "#EFD9C5", opacity: 0.52 }} />
    </View>;
  }
  if (preferences.theme === "mint") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 180, height: 82, borderRadius: 110, backgroundColor: "#C7E8DA", opacity: 0.52, top: 8, left: -42, transform: [{ rotate: "-32deg" }] }} />
      <View style={{ position: "absolute", width: 166, height: 70, borderRadius: 100, backgroundColor: "#D7EFE1", opacity: 0.64, top: 110, right: -58, transform: [{ rotate: "36deg" }] }} />
      <View style={{ position: "absolute", width: "145%", height: 135, bottom: -83, left: "-21%", borderRadius: 140, backgroundColor: "#CFE9DC", opacity: 0.57 }} />
    </View>;
  }
  if (preferences.theme === "starry") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 280, height: 280, borderRadius: 140, backgroundColor: "#27346C", opacity: 0.32, top: -150, right: -88 }} />
      {starPositions.map(([left, top, size], index) => <Animated.View key={`${left}-${top}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: size, backgroundColor: "#FFFFFF", opacity: index % 3 === 0 ? glow : 0.72, shadowColor: "#B8D8FF", shadowOpacity: 0.9, shadowRadius: 5 }} />)}
      <View style={{ position: "absolute", width: "145%", height: 130, bottom: -93, left: "-22%", borderRadius: 130, backgroundColor: "#101C45", opacity: 0.9 }} />
    </View>;
  }
  if (preferences.theme === "ocean") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 190, height: 190, borderRadius: 100, backgroundColor: "#9BE8F3", opacity: 0.16, top: -98, right: -36 }} />
      <View style={{ position: "absolute", width: "150%", height: 122, bottom: 125, left: "-25%", borderRadius: 150, backgroundColor: "#0B5470", opacity: 0.8, transform: [{ rotate: "-5deg" }] }} />
      <View style={{ position: "absolute", width: "150%", height: 178, bottom: 18, left: "-20%", borderRadius: 180, backgroundColor: "#0E718A", opacity: 0.8, transform: [{ rotate: "4deg" }] }} />
      <View style={{ position: "absolute", width: "155%", height: 132, bottom: -63, left: "-26%", borderRadius: 160, backgroundColor: "#0B4967", opacity: 0.92, transform: [{ rotate: "-3deg" }] }} />
      {[5, 25, 45, 65, 85].map((left, index) => <View key={`wave-${left}`} style={{ position: "absolute", width: 72, height: 26, borderRadius: 36, borderTopWidth: 4, borderColor: "#B7F7FF", opacity: 0.68 - index * 0.06, bottom: index % 2 ? 118 : 146, left: `${left}%`, transform: [{ rotate: index % 2 ? "-8deg" : "7deg" }] }} />)}
      <View style={{ position: "absolute", width: 16, height: 34, borderRadius: 12, backgroundColor: "#9EE8EE", opacity: 0.56, bottom: 90, left: "68%", transform: [{ rotate: "-16deg" }] }} />
      <View style={{ position: "absolute", width: 74, height: 12, borderRadius: 12, backgroundColor: "#9EE8EE", opacity: 0.5, bottom: 104, left: "60%", transform: [{ rotate: "8deg" }] }} />
    </View>;
  }
  if (preferences.theme === "sunset") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 158, height: 158, borderRadius: 80, backgroundColor: "#FFE0A6", opacity: 0.82, top: 58, right: 30 }} />
      <View style={{ position: "absolute", width: "145%", height: 26, bottom: 188, left: "-23%", backgroundColor: "#C96D66", opacity: 0.52 }} />
      <View style={{ position: "absolute", width: "150%", height: 116, bottom: 73, left: "-25%", borderRadius: 120, backgroundColor: "#B95C69", opacity: 0.64, transform: [{ rotate: "-3deg" }] }} />
      <View style={{ position: "absolute", width: "150%", height: 130, bottom: -23, left: "-20%", borderRadius: 150, backgroundColor: "#754D75", opacity: 0.64 }} />
      {[0, 1, 2, 3].map(index => <View key={`reflection-${index}`} style={{ position: "absolute", width: 88 - index * 12, height: 4, borderRadius: 4, backgroundColor: "#FFD49A", opacity: 0.46 - index * 0.07, right: 63 + index * 6, bottom: 142 - index * 18 }} />)}
      <View style={{ position: "absolute", width: 44, height: 4, borderRadius: 5, backgroundColor: "#523E58", opacity: 0.65, top: 126, left: 38, transform: [{ rotate: "-10deg" }] }} />
      <View style={{ position: "absolute", width: 28, height: 4, borderRadius: 5, backgroundColor: "#523E58", opacity: 0.65, top: 137, left: 73, transform: [{ rotate: "12deg" }] }} />
    </View>;
  }
  if (preferences.theme === "forest") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 42, height: 210, borderRadius: 25, backgroundColor: "#8BB095", opacity: 0.28, left: 20, top: -58, transform: [{ rotate: "16deg" }] }} />
      <View style={{ position: "absolute", width: 160, height: 160, borderRadius: 100, backgroundColor: "#B4D3B7", opacity: 0.43, right: -42, top: 12 }} />
      <View style={{ position: "absolute", width: "155%", height: 160, bottom: -88, left: "-26%", borderRadius: 160, backgroundColor: "#9BC5A0", opacity: 0.46, transform: [{ rotate: "-4deg" }] }} />
      <View style={{ position: "absolute", width: "150%", height: 125, bottom: -95, left: "-20%", borderRadius: 140, backgroundColor: "#6FA87A", opacity: 0.35, transform: [{ rotate: "5deg" }] }} />
    </View>;
  }
  if (preferences.theme === "meadow") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 160, height: 160, borderRadius: 90, backgroundColor: "#F5D976", opacity: 0.36, top: -72, right: -28 }} />
      <View style={{ position: "absolute", width: "145%", height: 135, bottom: 58, left: "-24%", borderRadius: 150, backgroundColor: "#D8EAA9", opacity: 0.7, transform: [{ rotate: "-5deg" }] }} />
      <View style={{ position: "absolute", width: "150%", height: 145, bottom: -76, left: "-26%", borderRadius: 150, backgroundColor: "#9EC87D", opacity: 0.48, transform: [{ rotate: "4deg" }] }} />
      {[12, 29, 46, 72, 88].map(left => <View key={left} style={{ position: "absolute", width: 3, height: 42, bottom: 56, left: `${left}%`, backgroundColor: "#6E9B5D", opacity: 0.42, transform: [{ rotate: left % 2 ? "-16deg" : "13deg" }] }} />)}
    </View>;
  }
  if (preferences.theme === "snow") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 180, height: 180, borderRadius: 100, backgroundColor: "#FFFFFF", opacity: 0.52, top: -92, right: -36 }} />
      {snowPositions.map(([left, top, size]) => <View key={`${left}-${top}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: size, backgroundColor: "#FFFFFF", opacity: 0.78 }} />)}
      <View style={{ position: "absolute", width: "150%", height: 142, bottom: -70, left: "-24%", borderRadius: 150, backgroundColor: "#D9E8F1", opacity: 0.85, transform: [{ rotate: "-5deg" }] }} />
      <View style={{ position: "absolute", width: "145%", height: 112, bottom: -80, left: "-16%", borderRadius: 130, backgroundColor: "#C6DCE9", opacity: 0.56, transform: [{ rotate: "6deg" }] }} />
    </View>;
  }
  if (preferences.theme === "lavender") {
    return <View pointerEvents="none" style={sceneContainer}>
      <View style={{ position: "absolute", width: 180, height: 150, borderRadius: 90, backgroundColor: "#D8C6E9", opacity: 0.47, top: -64, left: -38 }} />
      <View style={{ position: "absolute", width: "145%", height: 125, bottom: 50, left: "-22%", borderRadius: 140, backgroundColor: "#D5C4E5", opacity: 0.54, transform: [{ rotate: "-5deg" }] }} />
      {[9, 21, 37, 61, 78, 92].map(left => <View key={left} style={{ position: "absolute", width: 5, height: 52, borderRadius: 5, bottom: 18, left: `${left}%`, backgroundColor: "#9C78BC", opacity: 0.42, transform: [{ rotate: left % 2 ? "-9deg" : "8deg" }] }} />)}
    </View>;
  }
  return null;
}

function AppText({ style, ...props }: TextProps) {
  const { preferences } = useAppearance();
  const flattened = StyleSheet.flatten(style) || {};
  const baseSize = typeof flattened.fontSize === "number" ? flattened.fontSize : 14;
  const baseLineHeight =
    typeof flattened.lineHeight === "number" ? flattened.lineHeight : undefined;
  const scale = appearanceScaleMap[preferences.scale];
  return (
    <NativeTextComponent
      {...props}
      style={[
        style,
        {
          fontSize: baseSize * scale,
          ...(baseLineHeight ? { lineHeight: baseLineHeight * scale } : {}),
          fontFamily: appearanceFontMap[preferences.font],
        },
      ]}
    />
    );
}
const Text = AppText;

type DrawerAction =
  | "overview"
  | "calendar"
  | "analysis"
  | "planning"
  | "settings";
type ConfirmOption = {
  label: string;
  onPress: () => void | Promise<void>;
  destructive?: boolean;
  icon?: string;
};
type ConfirmRequest = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
  options?: ConfirmOption[];
};
type User = { id: number; name: string | null; email: string | null };
type Ledger = { id: number; name: string; type: string; inviteCode: string };
type LedgerMember = {
  member: { userId: number; role: "admin" | "member" | "viewer" };
  user: { id: number; name: string | null; email: string | null };
};
type Category = {
  id: number;
  parentCategoryId: number;
  name: string;
  type: "expense" | "income";
  icon: string;
  color: string;
  isActive?: number;
};
type PaymentMethod = { id: number; name: string; icon: string; isActive?: number };
type ActivityLog = {
  log: {
    id: number;
    action: "create" | "update" | "delete";
    entityType: "transaction" | "category" | "paymentMethod";
    entityId: number;
    summary: string;
    metadata: string | null;
    createdAt: Date | string;
  };
  user: { id: number; name: string | null; email: string | null };
};
type Transaction = {
  id: number;
  amount: number;
  type: "expense" | "income" | "transfer";
  payerId: number;
  categoryId: number;
  paymentMethodId: number;
  date: Date | string;
  note: string | null;
  splitType: "equal" | "custom" | "amount" | "none";
};
type Analytics = {
  income: number;
  expense: number;
  balance: number;
  categories: { id: number; name: string; color: string; amount: number }[];
};
type Settlement = {
  balances: { userId: number; net: number }[];
  settlement: { fromUserId: number; toUserId: number; amount: number } | null;
};
type SettlementHistory = {
  id: number;
  month: string;
  fromUserId: number;
  toUserId: number;
  amount: number;
  status: string;
  settledAt: Date | string;
};
type Budget = { id: number; categoryId: number; amount: number; month: string };
type TravelPlan = {
  id: number;
  ledgerId: number;
  createdBy: number;
  name: string;
  budget: number;
  startDate: Date | string;
  endDate: Date | string;
  notes: string | null;
};
type Recurring = {
  id: number;
  title: string;
  amount: number;
  type: "expense" | "income";
  categoryId: number;
  paymentMethodId: number;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: number;
  isActive: number;
};

const CATEGORY_EMOJI_CHOICES = ["🍜", "☕", "🚗", "⛽", "🏠", "🧺", "🛍️", "📱", "🎮", "💕", "✈️", "💊", "📚", "💰", "🎁", "✨", "🏷️"];
const PAYMENT_EMOJI_CHOICES = ["💵", "💳", "📱", "🏦", "🧾", "🎁", "🔁", "💸"];
const CATEGORY_LEGACY_EMOJI: Record<string, string> = {
  food: "🍜", car: "🚗", home: "🏠", shopping: "🛍️", heart: "💕", income: "💰",
  "⌂": "🏠", "◌": "🏷️", "♡": "💕", "↗": "💰", "＋": "💰", "◇": "🛍️", "✦": "✨",
};
const PAYMENT_LEGACY_EMOJI: Record<string, string> = {
  cash: "💵", card: "💳", pay: "📱", bank: "🏦", "現": "💵", "卡": "💳", "支": "📱", "銀": "🏦",
};
const categoryEmoji = (item?: Pick<Category, "name" | "icon">) => {
  const icon = item?.icon?.trim() || "";
  const legacy = CATEGORY_LEGACY_EMOJI[icon.toLowerCase()];
  if (legacy && icon !== "◌") return legacy;
  const label = `${item?.name || ""} ${icon}`;
  if (/油/.test(label)) return "⛽";
  if (/餐|飲|咖啡|食/.test(label)) return "🍜";
  if (/交|車|停/.test(label)) return "🚗";
  if (/住|房|水|電|生活|日用/.test(label)) return "🏠";
  if (/購|衣|3c|娛樂|遊戲/.test(label)) return "🛍️";
  if (/旅|出遊/.test(label)) return "✈️";
  if (/薪|收入|獎金/.test(label)) return "💰";
  return legacy || icon || "🏷️";
};
const paymentEmoji = (item?: Pick<PaymentMethod, "name" | "icon">) => {
  const icon = item?.icon?.trim() || "";
  const legacy = PAYMENT_LEGACY_EMOJI[icon.toLowerCase()];
  if (legacy) return legacy;
  const label = `${item?.name || ""} ${icon}`;
  if (/現金/.test(label)) return "💵";
  if (/信用|卡/.test(label)) return "💳";
  if (/電子|line|街口|pay/.test(label)) return "📱";
  if (/銀行|轉帳/.test(label)) return "🏦";
  return icon || "💳";
};

const money = (value: number) =>
  `NT$ ${Math.round(value || 0).toLocaleString("zh-TW")}`;
const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const isValidDateKey = (value: string) => {
  const match = dateKeyPattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
};
const localDateFromKey = (value: string, endOfDay = false) => {
  const match = dateKeyPattern.exec(value);
  if (!match) return new Date(NaN);
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
  );
};
const dateKey = (date: Date | string) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const previousMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) => month.replace("-", " / ");
const actionLabel = (action: DrawerAction) =>
  ({
    overview: "總覽",
    calendar: "月曆",
    analysis: "分析",
    planning: "規劃",
    settings: "設定",
  })[action];
const inviteCodeFromUrl = (url: string | null) => {
  if (!url) return "";
  const parsed = Linking.parse(url);
  const path = String(parsed.path || "").replace(/^\/+|\/+$/g, "");
  if (path !== "join" && path !== "invite") return "";
  const rawCode = parsed.queryParams?.code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  return typeof code === "string" ? code.trim().toUpperCase() : "";
};

export default function IndexScreen() {
  return (
    <AppearanceProvider>
      <AppContent />
    </AppearanceProvider>
  );
}

function AppContent() {
  const { palette, preferences } = useAppearance();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(notificationDefaults);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [activeLedger, setActiveLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [calendarTransactions, setCalendarTransactions] = useState<
    Transaction[]
  >([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [previousAnalytics, setPreviousAnalytics] = useState<Analytics | null>(
    null
  );
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [settlementHistory, setSettlementHistory] = useState<SettlementHistory[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [travelPlans, setTravelPlans] = useState<TravelPlan[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [ledgerModal, setLedgerModal] = useState<"create" | "join" | null>(
    null
  );
  const [transactionModal, setTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [budgetModal, setBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [travelPlanModal, setTravelPlanModal] = useState(false);
  const [recurringModal, setRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<Recurring | null>(null);
  const [settingsModal, setSettingsModal] = useState<
    "category" | "payment" | null
  >(null);
  const [ledgerManageModal, setLedgerManageModal] = useState<"rename" | "transfer" | null>(null);
  const [travelPlanName, setTravelPlanName] = useState("");
  const [travelPlanBudget, setTravelPlanBudget] = useState("");
  const [travelPlanStartDate, setTravelPlanStartDate] = useState("");
  const [travelPlanEndDate, setTravelPlanEndDate] = useState("");
  const [travelPlanNotes, setTravelPlanNotes] = useState("");
  const [ledgerName, setLedgerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pendingInviteCode, setPendingInviteCode] = useState("");
  const [ledgerType, setLedgerType] = useState<"couple" | "roommate" | "family">("couple");
  const [activeAction, setActiveAction] = useState<DrawerAction>("overview");
  const [ledgerHome, setLedgerHome] = useState(false);
  const [homePage, setHomePage] = useState<"ledgers" | "profile">("ledgers");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus>("idle");
  const [appUpdateProgress, setAppUpdateProgress] = useState(0);
  const [accountDeletionVisible, setAccountDeletionVisible] = useState(false);
  const ledgerRequestRef = useRef(0);
  const ledgerSelectionRef = useRef(0);
  const mutationGuardRef = useRef(new Set<string>());
  const notificationRequestRef = useRef(0);
  const updateNoticeRef = useRef(false);
  const recurringSyncRef = useRef(new Map<number, number>());
  const toastSequenceRef = useRef(0);

  const showToast = useCallback((message: string) => {
    setToast({ id: ++toastSequenceRef.current, message });
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToast(current => current?.id === id ? null : current);
  }, []);

  const installAndroidUpdate = useCallback(async (release: AppUpdateRelease) => {
    if (Platform.OS !== "android") {
      setError("App 內更新目前僅支援 Android 裝置。");
      return;
    }
    setAppUpdateStatus("downloading");
    setAppUpdateProgress(0);
    const destination = `${FileSystem.cacheDirectory}together-ledger-${release.version}.apk`;
    try {
      const download = FileSystem.createDownloadResumable(
        release.apkUrl,
        destination,
        {},
        progress => {
          const total = progress.totalBytesExpectedToWrite;
          if (total > 0) setAppUpdateProgress(Math.round((progress.totalBytesWritten / total) * 100));
        }
      );
      const result = await download.downloadAsync();
      if (!result?.uri) throw new Error("更新檔下載未完成，請稍後重新嘗試。");
      setAppUpdateStatus("installing");
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      showToast("更新檔已下載完成，請在 Android 系統安裝畫面確認更新。");
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: APK_MIME_TYPE,
      });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "更新失敗，請確認網路或安裝權限後再試一次。";
      setError(`無法完成 App 內更新：${message}`);
    } finally {
      setAppUpdateStatus("idle");
      setAppUpdateProgress(0);
    }
  }, [showToast]);

  const checkForAppUpdate = useCallback(async (manual = false) => {
    if (appUpdateStatus !== "idle") return;
    setAppUpdateStatus("checking");
    try {
      const release = await fetchLatestAndroidRelease();
      if (!release || !isVersionNewer(release.version, APP_VERSION)) {
        if (manual) showToast("目前已是最新版本。");
        return;
      }
      if (!manual && preferences.autoDownloadUpdatesOnWifi && Platform.OS === "android") {
        const networkState = await Network.getNetworkStateAsync();
        if (networkState.isConnected && networkState.type === Network.NetworkStateType.WIFI) {
          await installAndroidUpdate(release);
          return;
        }
      }
      setConfirmRequest({
        title: "發現新版 Together Ledger",
        message: formatUpdateMessage(release),
        cancelText: "稍後再說",
        confirmText: "下載並更新",
        onConfirm: () => installAndroidUpdate(release),
      });
    } catch (updateError) {
      if (manual) {
        const message = updateError instanceof Error ? updateError.message : "無法檢查更新，請稍後再試。";
        setError(message);
      }
    } finally {
      setAppUpdateStatus("idle");
    }
  }, [appUpdateStatus, installAndroidUpdate, preferences.autoDownloadUpdatesOnWifi, showToast]);

  const reloadLedger = useCallback(async (ledgerId: number) => {
    const requestId = ++ledgerRequestRef.current;
    const lastRecurringSync = recurringSyncRef.current.get(ledgerId) || 0;
    if (Date.now() - lastRecurringSync > 5 * 60_000) {
      await api.ledger.syncRecurring.mutate({ ledgerId }).catch(() => undefined);
      recurringSyncRef.current.set(ledgerId, Date.now());
    }
    const month = currentMonth();
    const workspace = await api.ledger.workspace.query({ ledgerId, month });
    if (requestId !== ledgerRequestRef.current) return false;
    setMembers(workspace.members as LedgerMember[]);
    setCategories(workspace.categories as Category[]);
    setPaymentMethods(workspace.paymentMethods as PaymentMethod[]);
    setTransactions(workspace.transactions as Transaction[]);
    setCalendarTransactions(workspace.calendarTransactions as Transaction[]);
    setAnalytics(workspace.analytics as Analytics);
    setPreviousAnalytics(workspace.previousAnalytics as Analytics);
    setSettlement(workspace.settlement as Settlement);
    setSettlementHistory(workspace.settlementHistory as SettlementHistory[]);
    setBudgets(workspace.budgets as Budget[]);
    setTravelPlans(workspace.travelPlans as TravelPlan[]);
    setRecurring(workspace.recurring as Recurring[]);
    setActivityLogs(workspace.activityLogs as ActivityLog[]);
    return true;
  }, []);

  const loadWorkspace = useCallback(async () => {
    setBusy(true);
    try {
      const nextUser = await api.auth.me.query();
      if (!nextUser) {
        await clearSessionToken();
        setUser(null);
        setLedgers([]);
        setActiveLedger(null);
        return;
      }
      setUser(nextUser as User);
      const notificationRequestId = ++notificationRequestRef.current;
      const [rows, preferences] = await Promise.all([
        api.ledger.list.query() as Promise<Array<{ ledger: Ledger }>>,
        api.notifications.preferences.query() as Promise<NotificationPreferences>,
      ]);
      const nextLedgers = rows.map(row => row.ledger);
      setLedgers(nextLedgers);
      if (notificationRequestId === notificationRequestRef.current) {
        setNotificationPreferences(normalizeNotificationPreferences(preferences));
      }
      // Never restore the last open ledger after a cold start. The app always opens at the ledger home.
      setLedgerHome(true);
      setHomePage("ledgers");
      setActiveLedger(null);
      if (nextLedgers.length === 0) {
        setMembers([]);
        setCategories([]);
        setPaymentMethods([]);
        setTransactions([]);
        setCalendarTransactions([]);
        setAnalytics(null);
        setPreviousAnalytics(null);
        setSettlement(null);
        setSettlementHistory([]);
        setBudgets([]);
        setTravelPlans([]);
        setRecurring([]);
        setActivityLogs([]);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "無法載入帳本資料。";
      setError(message);
      if (
        String(message).includes("UNAUTHORIZED") ||
        String(message).includes("Unauthorized")
      ) {
        await clearSessionToken();
        setUser(null);
      }
    } finally {
      setBusy(false);
      setReady(true);
    }
  }, [reloadLedger]);

  useEffect(() => {
    getSessionToken().then(token => {
      if (token) void loadWorkspace();
      else setReady(true);
    });
  }, [loadWorkspace]);
  useEffect(() => {
    let mounted = true;
    const receiveInvite = (url: string | null) => {
      const code = inviteCodeFromUrl(url);
      if (mounted && code) setPendingInviteCode(code);
    };
    void Linking.getInitialURL().then(receiveInvite);
    const subscription = Linking.addEventListener("url", event => {
      receiveInvite(event.url);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user || updateNoticeRef.current) return;
    updateNoticeRef.current = true;
    void checkForAppUpdate();
  }, [checkForAppUpdate, user]);
  useEffect(() => {
    if (!ready || !user || !pendingInviteCode || ledgerModal) return;
    setInviteCode(pendingInviteCode);
    setPendingInviteCode("");
    setError("");
    setLedgerModal("join");
  }, [ready, user, pendingInviteCode, ledgerModal]);
  useEffect(() => {
    if (!error) return;
    const timeoutId = setTimeout(() => setError(current => current === error ? "" : current), 6_000);
    return () => clearTimeout(timeoutId);
  }, [error]);

  const selectLedger = async (ledger: Ledger) => {
    const selectionId = ++ledgerSelectionRef.current;
    setLedgerHome(false);
    setActiveLedger(ledger);
    setBusy(true);
    try {
      await reloadLedger(ledger.id);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "切換帳本失敗。"
      );
    } finally {
      if (selectionId === ledgerSelectionRef.current) setBusy(false);
    }
  };

  const clearLedgerWorkspace = () => {
    ledgerRequestRef.current += 1;
    ledgerSelectionRef.current += 1;
    setActiveLedger(null);
    setMembers([]);
    setCategories([]);
    setPaymentMethods([]);
    setTransactions([]);
    setCalendarTransactions([]);
    setAnalytics(null);
    setPreviousAnalytics(null);
    setSettlement(null);
    setSettlementHistory([]);
    setBudgets([]);
    setTravelPlans([]);
    setRecurring([]);
    setActivityLogs([]);
  };
  const leaveLedger = () => {
    clearLedgerWorkspace();
    setLedgerHome(true);
    setHomePage("ledgers");
    setError("");
  };
  const updateLedgerName = async (name: string) => {
    if (!activeLedger) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("帳本名稱不能是空白。");
      return;
    }
    setBusy(true);
    try {
      await api.ledger.rename.mutate({ ledgerId: activeLedger.id, name: trimmed });
      const nextLedger = { ...activeLedger, name: trimmed };
      setActiveLedger(nextLedger);
      setLedgers(current => current.map(item => item.id === nextLedger.id ? nextLedger : item));
      setLedgerManageModal(null);
      setError("");
      showToast("帳本名稱已更新。");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "帳本名稱更新失敗。");
    } finally {
      setBusy(false);
    }
  };
  const transferOwnership = async (targetUserId: number) => {
    if (!activeLedger) return;
    setBusy(true);
    try {
      await api.ledger.transferOwnership.mutate({ ledgerId: activeLedger.id, targetUserId });
      await refresh();
      setLedgerManageModal(null);
      showToast("帳本所有權已轉讓。");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "帳本所有權轉讓失敗。");
    } finally {
      setBusy(false);
    }
  };
  const createTravelPlan = async () => {
    if (!activeLedger) return;
    const budget = Number(travelPlanBudget);
    if (!travelPlanName.trim() || !Number.isInteger(budget) || budget <= 0) {
      setError("請輸入出遊名稱與正整數預算。");
      return;
    }
    if (!isValidDateKey(travelPlanStartDate) || !isValidDateKey(travelPlanEndDate) || travelPlanStartDate > travelPlanEndDate) {
      setError("請輸入有效的日期範圍（YYYY-MM-DD）。");
      return;
    }
    setBusy(true);
    try {
      await api.ledger.createTravelPlan.mutate({
        ledgerId: activeLedger.id,
        name: travelPlanName.trim(),
        budget,
        startDate: localDateFromKey(travelPlanStartDate),
        endDate: localDateFromKey(travelPlanEndDate, true),
        notes: travelPlanNotes.trim() || undefined,
      });
      setTravelPlanName("");
      setTravelPlanBudget("");
      setTravelPlanStartDate("");
      setTravelPlanEndDate("");
      setTravelPlanNotes("");
      setTravelPlanModal(false);
      setError("");
      await refresh();
      showToast("出遊規劃已建立。");
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "出遊規劃建立失敗。");
    } finally {
      setBusy(false);
    }
  };
  const removeTravelPlan = (planId: number) => {
    if (!activeLedger) return;
    setConfirmRequest({
      title: "刪除出遊規劃",
      message: "刪除後不會影響帳本交易，但規劃資料無法復原。",
      confirmText: "確定刪除",
      destructive: true,
      onConfirm: async () => {
        try {
          await api.ledger.deleteTravelPlan.mutate({ ledgerId: activeLedger.id, planId });
          await refresh();
          showToast("出遊規劃已刪除。");
        } catch (planError) {
          setError(planError instanceof Error ? planError.message : "出遊規劃刪除失敗。");
        }
      },
    });
  };
  const updateNickname = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("暱稱不能是空白。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await api.profile.updateName.mutate({ name: trimmed });
      setUser(current => (current ? { ...current, name: updated.name } : current));
      showToast("暱稱已儲存。");
    } catch (nameError) {
      setError(nameError instanceof Error ? nameError.message : "暱稱更新失敗。");
    } finally {
      setBusy(false);
    }
  };
  const saveNotificationPreferences = async (next: NotificationPreferences) => {
    const normalizedAmount = Math.max(0, Math.min(100_000_000, Math.trunc(next.minimumAmount)));
    const normalizedReminderDay = Math.max(1, Math.min(28, Math.trunc(next.monthlyReminderDay)));
    const wasNormalized = normalizedAmount !== next.minimumAmount || normalizedReminderDay !== next.monthlyReminderDay;
    const requiresPush = next.incomeEnabled === 1 || next.expenseEnabled === 1 || next.monthlySettlementEnabled === 1;
    let pushPermissionUnavailable = false;
    let pushRegistrationUnavailable = false;
    const requestId = ++notificationRequestRef.current;
    const previous = notificationPreferences;
    const normalized = normalizeNotificationPreferences({ ...next, minimumAmount: normalizedAmount, monthlyReminderDay: normalizedReminderDay });
    setNotificationPreferences(normalized);
    setBusy(true);
    try {
      if (requiresPush) {
        try {
          const expoPushToken = await requestExpoPushToken();
          if (expoPushToken) {
            await api.notifications.registerDevice.mutate({
              expoPushToken,
              platform: Platform.OS === "ios" ? "ios" : "android",
            });
          } else {
            pushPermissionUnavailable = true;
          }
        } catch {
          // 裝置註冊不可阻斷偏好保存；可能是 Firebase 初次設定、網路或系統服務暫時不可用。
          pushRegistrationUnavailable = true;
        }
      }
      const saved = await api.notifications.updatePreferences.mutate({
        incomeEnabled: normalized.incomeEnabled === 1,
        expenseEnabled: normalized.expenseEnabled === 1,
        minimumAmount: normalizedAmount,
        monthlySettlementEnabled: next.monthlySettlementEnabled === 1,
        monthlyReminderDay: normalizedReminderDay,
      }) as NotificationPreferences;
      if (requestId === notificationRequestRef.current) {
        setNotificationPreferences(normalizeNotificationPreferences(saved));
        showToast(
          pushPermissionUnavailable
            ? "提醒設定已儲存。請在手機系統設定允許通知後，即可收到推播。"
            : pushRegistrationUnavailable
              ? "提醒設定已儲存。推播裝置尚未完成註冊，請確認網路與通知權限後再次儲存。"
            : wasNormalized
              ? "提醒日期與通知門檻已調整為可支援範圍並儲存。"
              : "提醒設定已儲存並同步。"
        );
      }
    } catch (notificationError) {
      if (requestId === notificationRequestRef.current) setNotificationPreferences(previous);
      setError(notificationError instanceof Error ? notificationError.message : "通知設定儲存失敗。");
    } finally {
      setBusy(false);
    }
  };
  const confirmDeleteLedger = () => {
    if (!activeLedger) return;
    setConfirmRequest({
      title: "再次確認刪除帳本",
      message: `刪除「${activeLedger.name}」後，帳本資料將無法復原。`,
      confirmText: "確定刪除",
      destructive: true,
      onConfirm: async () => {
        try {
          await api.ledger.leave.mutate({ ledgerId: activeLedger.id, action: "delete" });
          setLedgers(current => current.filter(item => item.id !== activeLedger.id));
          leaveLedger();
          showToast("帳本已刪除。");
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : "移除帳本失敗。");
        }
      },
    });
  };
  const performLeaveLedger = async (action: "leave" | "transfer", transferToUserId?: number) => {
    if (!activeLedger) return;
    setBusy(true);
    try {
      await api.ledger.leave.mutate({ ledgerId: activeLedger.id, action, transferToUserId });
      setLedgers(current => current.filter(item => item.id !== activeLedger.id));
      leaveLedger();
      showToast(action === "leave" ? "你已退出帳本。" : "帳本所有權已轉讓。");
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "退出帳本失敗。");
    } finally {
      setBusy(false);
    }
  };
  const requestLeaveLedger = () => {
    if (!activeLedger) return;
    const me = members.find(item => item.user.id === user?.id);
    const others = members.filter(item => item.user.id !== user?.id);
    if (me?.member.role === "admin") {
      setConfirmRequest({
        title: "管理帳本離開方式",
        message: others.length > 0
          ? "你是此帳本的持有者。請選擇新的持有者，或刪除整本帳本。"
          : "你是唯一成員，無法轉讓所有權；若要離開，只能刪除整本帳本。",
        options: [
          ...others.map(item => ({
            label: `轉讓給 ${item.user.name || item.user.email || `成員 ${item.user.id}`}`,
            icon: "account-switch-outline",
            onPress: () => void performLeaveLedger("transfer", item.user.id),
          })),
          { label: "刪除帳本", icon: "delete-outline", destructive: true, onPress: confirmDeleteLedger },
        ],
      });
      return;
    }
    setConfirmRequest({
      title: "退出帳本",
      message: `退出「${activeLedger.name}」後，需要重新取得邀請碼才能加入。`,
      confirmText: "確定退出",
      destructive: true,
      onConfirm: () => performLeaveLedger("leave"),
    });
  };

  const refresh = async () => {
    if (activeLedger && !busy) {
      setBusy(true);
      try {
        await reloadLedger(activeLedger.id);
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "資料更新失敗。"
        );
      } finally {
        setBusy(false);
      }
    }
  };
  const handleLogin = async (input: { mode: "signIn" | "signUp"; email: string; password: string; name?: string }) => {
    setError("");
    setBusy(true);
    try {
      const result = input.mode === "signUp"
        ? await api.auth.register.mutate({ email: input.email, password: input.password, name: input.name || "" })
        : await api.auth.login.mutate({ email: input.email, password: input.password });
      await saveSessionToken(result.token);
      await loadWorkspace();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "登入失敗，請稍後再試。"
      );
    } finally {
      setBusy(false);
      setReady(true);
    }
  };
  const finishLedgerAction = async () => {
    setError("");
    if (!ledgerModal) return;
    const ledgerAction = ledgerModal;
    if (ledgerAction === "create" && !ledgerName.trim()) {
      setError("請輸入帳本名稱。");
      return;
    }
    if (ledgerAction === "join" && inviteCode.trim().length < 4) {
      setError("請輸入有效的邀請碼。");
      return;
    }
    const mutationKey = ledgerAction === "create"
      ? `create-ledger-${ledgerName.trim().toLowerCase()}`
      : `join-ledger-${inviteCode.trim().toUpperCase()}`;
    if (mutationGuardRef.current.has(mutationKey)) return;
    mutationGuardRef.current.add(mutationKey);
    setBusy(true);
    try {
      if (ledgerAction === "create")
        await api.ledger.create.mutate({
          name: ledgerName.trim(),
          type: ledgerType,
        });
      else {
        const joined = await api.ledger.join.mutate({
          inviteCode: inviteCode.trim().toUpperCase(),
        });
        if (!joined) throw new Error("找不到這組邀請碼，請確認後再試。");
      }
      setLedgerModal(null);
      setLedgerName("");
      setInviteCode("");
      setLedgerType("couple");
      await loadWorkspace();
      showToast(ledgerAction === "create" ? "帳本已建立。" : "已加入帳本。");
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "帳本操作失敗。"
      );
    } finally {
      setBusy(false);
      mutationGuardRef.current.delete(mutationKey);
    }
  };
  const performLogout = async () => {
    setBusy(true);
    try {
      await api.auth.logout.mutate();
    } catch {
      /* native token removal remains authoritative */
    }
    await clearSessionToken();
    setUser(null);
    setLedgers([]);
    clearLedgerWorkspace();
    setLedgerHome(true);
    setError("");
    setBusy(false);
  };
  const logout = () => {
    setConfirmRequest({
      title: "確認登出",
      message: "登出後需要重新登入才能查看共同帳本。",
      confirmText: "登出",
      destructive: true,
      onConfirm: performLogout,
    });
  };
  const deleteAccount = async (password: string) => {
    setError("");
    setBusy(true);
    try {
      await api.auth.deleteAccount.mutate({ password });
      await clearSessionToken();
      setAccountDeletionVisible(false);
      setUser(null);
      setLedgers([]);
      clearLedgerWorkspace();
      setLedgerHome(true);
      setHomePage("ledgers");
      showToast("帳號已刪除，已安全登出。你可以隨時使用新電子信箱重新註冊。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除帳號失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };
  const openNewTransaction = () => {
    setEditingTransaction(null);
    setTransactionModal(true);
  };
  const openEditTransaction = (transaction: Transaction) => {
    setConfirmRequest({
      title: "編輯收支",
      message: "將開啟編輯表單；尚未儲存前不會修改帳本資料。",
      confirmText: "開啟編輯",
      onConfirm: () => {
        setEditingTransaction(transaction);
        setTransactionModal(true);
      },
    });
  };
  const removeTransaction = (transaction: Transaction) => {
    setConfirmRequest({
      title: "確認移除收支",
      message: "這筆收支會從目前帳本移除。下一步會再確認一次。",
      confirmText: "下一步",
      onConfirm: () => {
        setConfirmRequest({
          title: "再次確認移除",
          message: "移除後只能從操作日誌查看事件，無法自動復原。",
          confirmText: "確定移除",
          destructive: true,
          onConfirm: async () => {
            try {
              await api.ledger.deleteTransaction.mutate({
                ledgerId: activeLedger!.id,
                transactionId: transaction.id,
              });
              setTransactions(current => current.filter(item => item.id !== transaction.id));
              setCalendarTransactions(current => current.filter(item => item.id !== transaction.id));
              void refresh();
              showToast("收支已刪除。");
            } catch (removeError) {
              setError(removeError instanceof Error ? removeError.message : "移除收支失敗。");
            }
          },
        });
      },
    });
  };
  const archiveCategoryItem = async (categoryId: number) => {
    try {
      await api.ledger.archiveCategory.mutate({ ledgerId: activeLedger!.id, categoryId });
      await refresh();
      showToast("分類已隱藏。");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "移除分類失敗。");
    }
  };
  const archivePaymentItem = async (paymentMethodId: number) => {
    try {
      await api.ledger.archivePaymentMethod.mutate({ ledgerId: activeLedger!.id, paymentMethodId });
      await refresh();
      showToast("支付方式已隱藏。");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "移除支付方式失敗。");
    }
  };
  const deleteCategoryItem = async (categoryId: number) => {
    try {
      await api.ledger.deleteCategory.mutate({ ledgerId: activeLedger!.id, categoryId });
      await refresh();
      showToast("分類已刪除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除分類失敗；若已有歷史交易，請改用隱藏功能。");
    }
  };
  const deletePaymentItem = async (paymentMethodId: number) => {
    try {
      await api.ledger.deletePaymentMethod.mutate({ ledgerId: activeLedger!.id, paymentMethodId });
      await refresh();
      showToast("支付方式已刪除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "刪除支付方式失敗；若已有歷史交易，請改用隱藏功能。");
    }
  };
  const openBudgetEditor = (budget?: Budget) => {
    setEditingBudget(budget || null);
    setBudgetModal(true);
  };
  const openRecurringEditor = (item?: Recurring) => {
    setEditingRecurring(item || null);
    setRecurringModal(true);
  };
  const removeBudget = (budget: Budget) => {
    const category = categories.find(item => item.id === budget.categoryId);
    const label = budget.categoryId === 0 ? "每月總預算" : `${category?.icon || "◌"} ${category?.name || "分類預算"}`;
    setConfirmRequest({
      title: "移除預算設定",
      message: `要移除「${label}」嗎？這不會刪除任何既有收支紀錄。`,
      confirmText: "下一步",
      onConfirm: () => setConfirmRequest({
        title: "再次確認移除預算",
        message: "移除後可隨時重新設定，但本月預算警示將不再使用此設定。",
        confirmText: "確定移除",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.ledger.deleteBudget.mutate({ ledgerId: activeLedger!.id, budgetId: budget.id });
            setBudgets(current => current.filter(item => item.id !== budget.id));
            void refresh();
            showToast("預算設定已移除。");
          } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : "移除預算失敗。");
          }
        },
      }),
    });
  };
  const removeRecurring = (item: Recurring) => {
    setConfirmRequest({
      title: "移除固定收支",
      message: `要移除「${item.title}」嗎？已建立的歷史收支紀錄會保留。`,
      confirmText: "下一步",
      onConfirm: () => setConfirmRequest({
        title: "再次確認移除固定收支",
        message: "移除後系統不會再自動建立此項目的未來收支。",
        confirmText: "確定移除",
        destructive: true,
        onConfirm: async () => {
          try {
            await api.ledger.deleteRecurring.mutate({ ledgerId: activeLedger!.id, recurringId: item.id });
            setRecurring(current => current.filter(currentItem => currentItem.id !== item.id));
            void refresh();
            showToast("固定收支已移除。");
          } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : "移除固定收支失敗。");
          }
        },
      }),
    });
  };
  const afterMutation = async (successMessage = "資料已儲存。") => {
    setTransactionModal(false);
    setEditingTransaction(null);
    setBudgetModal(false);
    setEditingBudget(null);
    setRecurringModal(false);
    setEditingRecurring(null);
    setSettingsModal(null);
    await refresh();
    showToast(successMessage);
  };

  if (!ready)
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.rose} />
        <Text style={styles.loadingText}>正在準備共帳…</Text>
      </View>
    );
  if (!user)
    return <LoginScreen error={error} busy={busy} onLogin={handleLogin} />;
    const homeHeaderAction = (
    <View style={styles.headerActions}>
      <Pressable
        onPress={() => setHomePage(current => current === "profile" ? "ledgers" : "profile")}
        style={styles.headerBackButton}
        accessibilityLabel="個人設定"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name={homePage === "profile" ? "arrow-left" : "account-outline"} size={19} color={palette.rose} />
      </Pressable>
    </View>
  );

  if (ledgers.length === 0)
    return (
      <>
        <AppHeader
          title={homePage === "profile" ? "個人設定" : "共帳"}
          caption={homePage === "profile" ? "管理你的 App 偏好" : "建立你的共同財務空間"}
          action={homeHeaderAction}
        />
        <AccountDeletionModal visible={accountDeletionVisible} busy={busy} error={error} onClose={() => setAccountDeletionVisible(false)} onSubmit={deleteAccount} />
        {homePage === "profile" ? (
          <PersonalSettingsPage user={user} error={error} notificationPreferences={notificationPreferences} onSaveNotificationPreferences={saveNotificationPreferences} onUpdateNickname={updateNickname} onCheckForUpdate={() => void checkForAppUpdate(true)} appUpdateStatus={appUpdateStatus} appUpdateProgress={appUpdateProgress} onLogout={logout} onDeleteAccount={() => setAccountDeletionVisible(true)} onBack={() => setHomePage("ledgers")} />
        ) : (
          <EmptyLedger
            error={error}
            onCreate={() => {
              setError("");
              setLedgerModal("create");
            }}
            onJoin={() => {
              setError("");
              setLedgerModal("join");
            }}
          />
        )}
        <LedgerModal
          mode={ledgerModal}
          ledgerName={ledgerName}
          inviteCode={inviteCode}
          ledgerType={ledgerType}
          error={error}
          busy={busy}
          setLedgerName={setLedgerName}
          setInviteCode={setInviteCode}
          setLedgerType={setLedgerType}
          onClose={() => {
            setError("");
            setLedgerModal(null);
          }}
          onSubmit={finishLedgerAction}
        />
        <ConfirmModal request={confirmRequest} onClose={() => setConfirmRequest(null)} />
        <SuccessToast toast={toast} onDismiss={dismissToast} />
      </>
    );

  if (ledgerHome)
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={["top", "bottom"]}>
        <ThemeAtmosphere />
        <AppHeader
          title={homePage === "profile" ? "個人設定" : "我的帳本"}
          caption={homePage === "profile" ? "管理你的 App 偏好" : "選擇要進入的共同空間"}
          action={homeHeaderAction}
        />
        <AccountDeletionModal visible={accountDeletionVisible} busy={busy} error={error} onClose={() => setAccountDeletionVisible(false)} onSubmit={deleteAccount} />
        {homePage === "profile" ? (
          <PersonalSettingsPage user={user} error={error} notificationPreferences={notificationPreferences} onSaveNotificationPreferences={saveNotificationPreferences} onUpdateNickname={updateNickname} onCheckForUpdate={() => void checkForAppUpdate(true)} appUpdateStatus={appUpdateStatus} appUpdateProgress={appUpdateProgress} onLogout={logout} onDeleteAccount={() => setAccountDeletionVisible(true)} onBack={() => setHomePage("ledgers")} />
        ) : (
          <LedgerHome
            ledgers={ledgers}
            onSelect={selectLedger}
            onCreate={() => {
              setError("");
              setLedgerModal("create");
            }}
            onJoin={() => {
              setError("");
              setLedgerModal("join");
            }}
          />
        )}
        <LedgerModal
          mode={ledgerModal}
          ledgerName={ledgerName}
          inviteCode={inviteCode}
          ledgerType={ledgerType}
          error={error}
          busy={busy}
          setLedgerName={setLedgerName}
          setInviteCode={setInviteCode}
          setLedgerType={setLedgerType}
          onClose={() => {
            setError("");
            setLedgerModal(null);
          }}
          onSubmit={finishLedgerAction}
        />
        <ConfirmModal request={confirmRequest} onClose={() => setConfirmRequest(null)} />
        <SuccessToast toast={toast} onDismiss={dismissToast} />
      </SafeAreaView>
    );

  const content =
    activeAction === "overview" ? (
      <Overview
        ledger={activeLedger!}
        user={user}
        members={members}
        analytics={analytics}
        settlement={settlement}
        transactions={transactions}
        categories={categories}
        onAdd={openNewTransaction}
        onEdit={openEditTransaction}
        onDelete={removeTransaction}
        onSettle={async () => {
          if (!activeLedger) return;
          setBusy(true);
          try {
            await api.ledger.settlement.markSettled.mutate({
              ledgerId: activeLedger.id,
              month: currentMonth(),
            });
            await refresh();
          } catch (settleError) {
            setError(
              settleError instanceof Error ? settleError.message : "結算失敗。"
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    ) : activeAction === "calendar" ? (
      <CalendarSection
        transactions={calendarTransactions}
        categories={categories}
        onEdit={openEditTransaction}
        onDelete={removeTransaction}
      />
    ) : activeAction === "analysis" ? (
      <AnalysisSection
        analytics={analytics}
        previousAnalytics={previousAnalytics}
      />
    ) : activeAction === "planning" ? (
      <PlanningSection
        analytics={analytics}
        budgets={budgets}
        travelPlans={travelPlans}
        categories={categories}
        recurring={recurring}
        onBudget={() => openBudgetEditor()}
        onEditBudget={openBudgetEditor}
        onDeleteBudget={removeBudget}
        onTravelPlan={() => setTravelPlanModal(true)}
        onDeleteTravelPlan={removeTravelPlan}
        onRecurring={() => openRecurringEditor()}
        onEditRecurring={openRecurringEditor}
        onDeleteRecurring={removeRecurring}
      />
    ) : (
      <SettingsSection
        ledger={activeLedger!}
        user={user}
        members={members}
        categories={categories}
        paymentMethods={paymentMethods}
        history={settlementHistory}
        activityLogs={activityLogs}
        onRenameLedger={() => setLedgerManageModal("rename")}
        onTransferOwnership={() => setLedgerManageModal("transfer")}
        onCategory={() => setSettingsModal("category")}
        onPayment={() => setSettingsModal("payment")}
        onArchiveCategory={archiveCategoryItem}
        onArchivePayment={archivePaymentItem}
        onDeleteCategory={deleteCategoryItem}
        onDeletePayment={deletePaymentItem}
        onRefresh={refresh}
        onLeaveLedger={requestLeaveLedger}
        onRoleChange={async (memberId, role) => {
          try {
            await api.ledger.updateMemberRole.mutate({
              ledgerId: activeLedger!.id,
              userId: memberId,
              role,
            });
            await refresh();
          } catch (roleError) {
            setError(
              roleError instanceof Error ? roleError.message : "權限更新失敗。"
            );
          }
        }}
      />
    );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={["top", "bottom"]}
    >
      <ThemeAtmosphere />
      <AppHeader
        title={actionLabel(activeAction)}
        caption={activeLedger?.name || "共同帳本"}
        action={
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="返回我的帳本"
              accessibilityRole="button"
              onPress={leaveLedger}
              style={styles.headerBackButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={19} color={colors.muted} />
            </Pressable>
            <Pressable onPress={refresh} style={styles.headerAddButton} accessibilityLabel="重新整理">
              <MaterialCommunityIcons
                name={busy ? "sync" : "refresh"}
                size={19}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        }
      />
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.pageContent}
      >
        <LedgerSelector
          ledgers={ledgers}
          activeLedgerId={activeLedger!.id}
          onSelect={selectLedger}
        />
        {!!error && <Text style={styles.globalError}>{error}</Text>}
        {content}
      </ScrollView>
      <QuickNav active={activeAction} onSelect={setActiveAction} />
      <TransactionModal
        visible={transactionModal}
        editingTransaction={editingTransaction}
        user={user}
        members={members}
        categories={categories}
        paymentMethods={paymentMethods}
        error={error}
        onClose={() => {
          setTransactionModal(false);
          setEditingTransaction(null);
        }}
        onSetupPayment={() => {
          setTransactionModal(false);
          setActiveAction("settings");
          setSettingsModal("payment");
        }}
        onSubmit={async input => {
          const mutationKey = editingTransaction
            ? `update-transaction-${editingTransaction.id}`
            : `create-transaction-${activeLedger!.id}`;
          if (mutationGuardRef.current.has(mutationKey)) return;
          mutationGuardRef.current.add(mutationKey);
          try {
            if (editingTransaction) {
              await api.ledger.updateTransaction.mutate({
                ledgerId: activeLedger!.id,
                transactionId: editingTransaction.id,
                ...input,
              });
            } else {
              await api.ledger.createTransaction.mutate({
                ledgerId: activeLedger!.id,
                ...input,
              });
            }
            await afterMutation(editingTransaction ? "收支已更新。" : "收支已新增。");
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "新增交易失敗。"
            );
          } finally {
            mutationGuardRef.current.delete(mutationKey);
          }
        }}
      />
      <BudgetModal
        visible={budgetModal}
        categories={categories}
        currentMonth={currentMonth()}
        ledgerId={activeLedger!.id}
        editingBudget={editingBudget}
        onClose={() => {
          setBudgetModal(false);
          setEditingBudget(null);
        }}
        onSubmit={async input => {
          const mutationKey = `budget-${input.ledgerId}-${input.month}`;
          if (mutationGuardRef.current.has(mutationKey)) return;
          mutationGuardRef.current.add(mutationKey);
          try {
            await api.ledger.upsertBudget.mutate(input);
            await afterMutation(editingBudget ? "分類預算已更新。" : "預算已儲存。");
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "預算儲存失敗。"
            );
          } finally {
            mutationGuardRef.current.delete(mutationKey);
          }
        }}
      />
      <RecurringModal
        visible={recurringModal}
        categories={categories}
        paymentMethods={paymentMethods}
        ledgerId={activeLedger!.id}
        editingRecurring={editingRecurring}
        onClose={() => {
          setRecurringModal(false);
          setEditingRecurring(null);
        }}
        onSubmit={async input => {
          const mutationKey = editingRecurring
            ? `update-recurring-${editingRecurring.id}`
            : `recurring-${activeLedger!.id}-${input.title.trim().toLowerCase()}`;
          if (mutationGuardRef.current.has(mutationKey)) return;
          mutationGuardRef.current.add(mutationKey);
          try {
            if (editingRecurring) {
              await api.ledger.updateRecurring.mutate({ ledgerId: activeLedger!.id, recurringId: editingRecurring.id, ...input });
            } else {
              await api.ledger.createRecurring.mutate({ ledgerId: activeLedger!.id, ...input });
            }
            await afterMutation(editingRecurring ? "固定收支已更新。" : "固定收支已建立。");
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "固定收支儲存失敗。"
            );
          } finally {
            mutationGuardRef.current.delete(mutationKey);
          }
        }}
      />
      <LedgerManageModal
        visible={ledgerManageModal !== null}
        mode={ledgerManageModal || "rename"}
        ledger={activeLedger!}
        members={members}
        user={user}
        error={error}
        busy={busy}
        onClose={() => {
          setLedgerManageModal(null);
          setError("");
        }}
        onRename={updateLedgerName}
        onTransfer={transferOwnership}
      />
      <TravelPlanModal
        visible={travelPlanModal}
        name={travelPlanName}
        budget={travelPlanBudget}
        startDate={travelPlanStartDate}
        endDate={travelPlanEndDate}
        notes={travelPlanNotes}
        error={error}
        busy={busy}
        setName={setTravelPlanName}
        setBudget={setTravelPlanBudget}
        setStartDate={setTravelPlanStartDate}
        setEndDate={setTravelPlanEndDate}
        setNotes={setTravelPlanNotes}
        onClose={() => {
          setTravelPlanModal(false);
          setError("");
        }}
        onSubmit={createTravelPlan}
      />
      <SettingsModal
        visible={settingsModal !== null}
        mode={settingsModal || "category"}
        ledgerId={activeLedger!.id}
        categories={categories}
        onClose={() => setSettingsModal(null)}
        onSubmit={async input => {
          const mutationKey = `settings-${settingsModal}-${activeLedger!.id}-${input.name.trim().toLowerCase()}`;
          if (mutationGuardRef.current.has(mutationKey)) return;
          mutationGuardRef.current.add(mutationKey);
          try {
            if (settingsModal === "category")
              await api.ledger.createCategory.mutate({
                ledgerId: activeLedger!.id,
                parentCategoryId: input.parentCategoryId,
                name: input.name,
                type: input.type,
                icon: input.icon,
                color: colors.rose,
              });
            else
              await api.ledger.createPaymentMethod.mutate({
                ledgerId: activeLedger!.id,
                name: input.name,
                icon: input.icon,
              });
            await afterMutation(settingsModal === "category" ? "分類已新增。" : "支付方式已新增。");
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "設定儲存失敗。"
            );
          } finally {
            mutationGuardRef.current.delete(mutationKey);
          }
                }}
      />
      <ConfirmModal request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <SuccessToast toast={toast} onDismiss={dismissToast} />
    </SafeAreaView>
  );
}

function SuccessToast({
  toast,
  onDismiss,
}: {
  toast: { id: number; message: string } | null;
  onDismiss: (id: number) => void;
}) {
  const { palette, preferences } = useAppearance();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: preferences.reduceMotion ? 0 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: preferences.reduceMotion ? 0 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: preferences.reduceMotion ? 0 : 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 8, duration: preferences.reduceMotion ? 0 : 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDismiss(toast.id);
      });
    }, 5_000);
    return () => clearTimeout(timeoutId);
  }, [onDismiss, opacity, preferences.reduceMotion, toast, translateY]);

  if (!toast) return null;
  return (
    <View pointerEvents="none" style={styles.globalToastLayer}>
      <Animated.View style={[styles.globalToast, { borderColor: palette.sage, backgroundColor: palette.surface, opacity, transform: [{ translateY }] }]}>
        <MaterialCommunityIcons name="check-circle-outline" size={18} color={palette.sage} />
        <Text style={[styles.globalToastText, { color: palette.ink }]}>{toast.message}</Text>
      </Animated.View>
    </View>
  );
}

function LoginScreen({
  error,
  busy,
  onLogin,
}: {
  error: string;
  busy: boolean;
  onLogin: (input: { mode: "signIn" | "signUp"; email: string; password: string; name?: string }) => void;
}) {
  const { palette } = useAppearance();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const isSignUp = mode === "signUp";
  const submit = () => {
    if (!email.trim() || !password || (isSignUp && !name.trim())) return;
    onLogin({ mode, email: email.trim(), password, name: name.trim() || undefined });
  };
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={["top", "bottom"]}>
      <ThemeAtmosphere />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
          <View style={styles.brandMark}>
            <MaterialCommunityIcons name="heart" size={28} color={colors.rose} />
          </View>
          <Text style={styles.brandTitle}>共帳</Text>
          <Text style={styles.brandSubtitle}>TOGETHER LEDGER</Text>
          <Text style={styles.loginHeading}>
            和重要的人，{"\n"}一起把生活記清楚。
          </Text>
          <Text style={styles.loginDescription}>
            專為情侶、室友與家庭設計的共同帳本。
          </Text>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>登入／註冊共帳</Text>
            <Text style={styles.formBody}>
              使用電子信箱與密碼登入；登入後可建立新帳本或透過邀請加入共同記帳空間。
            </Text>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {isSignUp && (
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="暱稱"
                placeholderTextColor={palette.muted}
                style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.ink }]}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
              />
            )}
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="電子信箱"
              placeholderTextColor={palette.muted}
              style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.ink }]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="密碼（至少 8 個字元）"
              placeholderTextColor={palette.muted}
              style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.ink }]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              textContentType={isSignUp ? "newPassword" : "password"}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            <Pressable
              disabled={busy}
              onPress={submit}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>{busy ? "處理中…" : isSignUp ? "建立帳號" : "登入"}</Text>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />}
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => setMode(current => current === "signIn" ? "signUp" : "signIn")}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.secondaryButtonText}>{isSignUp ? "已有帳號？直接登入" : "第一次使用？建立帳號"}</Text>
            </Pressable>
          </View>
          <Text style={styles.privacyText}>
            新帳本完全空白，所有交易與預算均由雙方手動記錄。
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AppHeader({
  title,
  caption,
  action,
}: {
  title: string;
  caption: string;
  action?: ReactNode;
}) {
  const { palette } = useAppearance();
  return (
    <SafeAreaView edges={["top"]} style={[styles.headerSafe, { backgroundColor: palette.surface }]}>
      <View style={[styles.appHeader, { borderBottomColor: palette.border }]}>
        <View style={styles.smallMark}>
          <MaterialCommunityIcons name="heart-multiple-outline" size={22} color={colors.rose} />
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerCaption}>{caption}</Text>
        </View>
        {action || <View style={styles.headerSpacer} />}
      </View>
    </SafeAreaView>
  );
}

function LedgerSelector({
  ledgers,
  activeLedgerId,
  onSelect,
}: {
  ledgers: Ledger[];
  activeLedgerId: number;
  onSelect: (ledger: Ledger) => void;
}) {
  const { palette } = useAppearance();
  return (
    <View style={styles.ledgerSelector}>
      <Text style={styles.selectorLabel}>目前帳本</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {ledgers.map(ledger => (
          <Pressable
            key={ledger.id}
            onPress={() => onSelect(ledger)}
            style={[
              styles.ledgerChip,
              ledger.id === activeLedgerId && styles.ledgerChipActive,
            ]}
          >
            <MaterialCommunityIcons
              name={ledger.type === "couple" ? "heart-outline" : "account-group-outline"}
              size={15}
              color={ledger.id === activeLedgerId ? palette.rose : palette.muted}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.ledgerChipText,
                ledger.id === activeLedgerId && styles.ledgerChipTextActive,
              ]}
            >
              {ledger.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function LedgerHome({
  ledgers,
  onSelect,
  onCreate,
  onJoin,
}: {
  ledgers: Ledger[];
  onSelect: (ledger: Ledger) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const { palette } = useAppearance();
  const [ledgerQuery, setLedgerQuery] = useState("");
  const visibleLedgers = useMemo(() => {
    const query = ledgerQuery.trim().toLocaleLowerCase();
    if (!query) return ledgers;
    return ledgers.filter(ledger => ledger.name.toLocaleLowerCase().includes(query));
  }, [ledgerQuery, ledgers]);
  return (
    <ScrollView contentContainerStyle={styles.ledgerHomeContent}>
      <SectionIntro
        eyebrow="MY LEDGERS"
        title="選擇共同帳本"
        body="先選擇要進入的空間，也可以建立新的帳本或使用邀請碼加入。"
      />
      <TextInput
        value={ledgerQuery}
        onChangeText={setLedgerQuery}
        placeholder="搜尋帳本名稱"
        placeholderTextColor={palette.muted}
        style={styles.input}
        accessibilityLabel="搜尋帳本名稱"
      />
      <View style={styles.settingsFilterRow}>
        <Text style={styles.rowSubtitle}>{visibleLedgers.length} 個帳本</Text>
        {!!ledgerQuery.trim() && <Pressable onPress={() => setLedgerQuery("")}><Text style={styles.settingsFilterText}>清除搜尋</Text></Pressable>}
      </View>
      {visibleLedgers.length === 0 ? <EmptyInline text="找不到符合的帳本名稱。" /> : visibleLedgers.map(ledger => (
        <Pressable
          key={ledger.id}
          onPress={() => onSelect(ledger)}
          style={({ pressed }) => [styles.ledgerHomeCard, pressed && styles.pressed]}
        >
          <View style={styles.ledgerHomeIcon}>
            <MaterialCommunityIcons
              name={ledger.type === "couple" ? "heart-outline" : "account-group-outline"}
              size={23}
              color={palette.rose}
            />
          </View>
          <View style={styles.memberPaymentName}>
            <Text style={styles.cardTitle}>{ledger.name}</Text>
            <Text style={styles.rowSubtitle}>點擊進入共同帳本</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
        </Pressable>
      ))}
      <View style={styles.actionRow}>
        <Pressable onPress={onCreate} style={styles.actionButton}>
          <MaterialCommunityIcons name="plus" size={19} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>建立帳本</Text>
        </Pressable>
        <Pressable onPress={onJoin} style={styles.secondaryActionButton}>
          <MaterialCommunityIcons name="account-multiple-plus-outline" size={19} color={palette.rose} />
          <Text style={styles.secondaryActionButtonText}>加入帳本</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function EmptyLedger({
  error,
  onCreate,
  onJoin,
}: {
  error: string;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const { palette } = useAppearance();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={["bottom"]}>
      <ThemeAtmosphere />
      <ScrollView contentContainerStyle={styles.emptyContent}>
        <View style={styles.emptyIllustration}>
          <MaterialCommunityIcons
            name="book-heart-outline"
            size={52}
            color={colors.rose}
          />
        </View>
        <Text style={styles.emptyTitle}>目前還沒有帳本</Text>
        <Text style={styles.emptyDescription}>
          這裡保持空白，不會替你建立範例交易或預算。建立新的共同帳本，或輸入邀請碼加入成員的帳本。
        </Text>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          onPress={onCreate}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>建立第一個帳本</Text>
        </Pressable>
        <Pressable
          onPress={onJoin}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name="account-multiple-plus-outline"
            size={20}
            color={colors.rose}
          />
          <Text style={styles.secondaryButtonText}>使用邀請碼加入</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Overview({
  ledger,
  user,
  members,
  analytics,
  settlement,
  transactions,
  categories,
  onAdd,
  onEdit,
  onDelete,
  onSettle,
}: {
  ledger: Ledger;
  user: User;
  members: LedgerMember[];
  analytics: Analytics | null;
  settlement: Settlement | null;
  transactions: Transaction[];
  categories: Category[];
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onSettle: () => void;
}) {
  const { palette } = useAppearance();
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [transactionRange, setTransactionRange] = useState<"week" | "month" | "lastMonth">("week");
  const memberNames = members
    .map(item => item.user.name || item.user.email || "成員")
    .join(" ＆ ");
  const paymentByMember = members.map(member => ({
    ...member,
    total: transactions
      .filter(tx => tx.payerId === member.user.id && tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0),
  }));
  const topCategory = analytics?.categories[0];
  const pending = settlement?.settlement;
  const now = new Date();
  const startOfRange = new Date(now.getFullYear(), now.getMonth(), 1);
  if (transactionRange === "week") {
    startOfRange.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  } else if (transactionRange === "lastMonth") {
    startOfRange.setMonth(now.getMonth() - 1, 1);
  }
  const endOfRange = transactionRange === "week"
    ? new Date(startOfRange.getFullYear(), startOfRange.getMonth(), startOfRange.getDate() + 7)
    : transactionRange === "lastMonth"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const rangeTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= startOfRange && txDate < endOfRange;
  });
  return (
    <>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>
          {ledger.type === "couple" ? "情侶共同帳本" : "多人共同帳本"}
        </Text>
        <Text style={styles.heroTitle}>{ledger.name}</Text>
        <Text style={styles.heroBody}>
          把每一份共同支出清楚記下來，讓生活更透明。
        </Text>
        <View style={styles.heroFooter}>
          <MaterialCommunityIcons
            name="account-multiple-outline"
            size={17}
            color="#F8E9E5"
          />
          <Text style={styles.heroFooterText}>
            {members.length} 位成員 · {memberNames || "等待成員加入"}
          </Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="cash-plus" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>新增收支</Text>
        </Pressable>
        <View style={styles.inviteBadge}>
          <Text style={styles.inviteBadgeLabel}>邀請碼</Text>
          <Text style={styles.inviteBadgeValue}>{ledger.inviteCode}</Text>
        </View>
      </View>
      <View style={styles.statRow}>
        <StatCard
          label="本月收入"
          value={money(analytics?.income || 0)}
          icon="cash-plus"
        />
        <StatCard
          label="本月支出"
          value={money(analytics?.expense || 0)}
          icon="cash-minus"
        />
      </View>
      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balanceLabel}>本月結餘</Text>
          <Text style={styles.balanceValue}>
            {money(analytics?.balance || 0)}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chart-donut"
          size={36}
          color={palette.rose}
        />
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>雙方支付總覽</Text>
          <Text style={styles.cardHint}>本月</Text>
        </View>
        <ScrollView style={styles.paymentOverviewScroll} nestedScrollEnabled>
          {paymentByMember.map(member => (
          <View key={member.user.id} style={styles.memberPaymentRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(member.user.name || member.user.email || "成").slice(0, 1)}
              </Text>
            </View>
            <View style={styles.memberPaymentName}>
              <Text style={styles.rowTitle}>
                {member.user.id === user.id
                  ? "你"
                  : member.user.name || member.user.email || "成員"}
              </Text>
              <Text style={styles.rowSubtitle}>
                {member.member.role === "admin"
                  ? "管理員"
                  : member.member.role === "viewer"
                    ? "檢視者"
                    : "成員"}
              </Text>
            </View>
            <Text style={styles.rowAmount}>{money(member.total)}</Text>
          </View>
          ))}
        </ScrollView>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>最近收支</Text>
          <Pressable onPress={() => setShowAllTransactions(true)} style={styles.recentTransactionsButton} accessibilityLabel="查看完整收支">
            <Text style={styles.settingsManagerText}>完整檢視</Text>
            <MaterialCommunityIcons name="arrow-top-right" size={15} color={palette.rose} />
          </Pressable>
        </View>
        {transactions.length === 0 ? (
          <EmptyInline text="目前沒有收支記錄。" />
        ) : (
          <FlatList
            style={styles.recentTransactionsScroll}
            data={transactions.slice(0, 8)}
            keyExtractor={tx => String(tx.id)}
            renderItem={({ item: tx }) => (
              <TransactionRow
                transaction={tx}
                categories={categories}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={3}
            removeClippedSubviews
          />
        )}
      </View>
      <View style={styles.insightCard}>
        <MaterialCommunityIcons
          name="star-outline"
          size={21}
          color={palette.rose}
        />
        <View style={styles.insightText}>
          <Text style={styles.insightTitle}>共同財務摘要</Text>
          <Text style={styles.insightBody}>
            {topCategory
              ? `本月最高支出分類是「${topCategory.name}」，共 ${money(topCategory.amount)}。`
              : "目前還沒有收支記錄，新增第一筆交易後會在這裡看到分析。"}
          </Text>
        </View>
      </View>
      <View style={styles.settlementCard}>
        <View style={styles.settlementIcon}>
          <MaterialCommunityIcons
            name="hand-coin-outline"
            size={22}
            color={palette.rose}
          />
        </View>
        <View style={styles.settlementText}>
          <Text style={styles.settlementTitle}>目前結算狀態</Text>
          <Text style={styles.settlementBody}>
            {pending
              ? `由 ${members.find(member => member.user.id === pending.fromUserId)?.user.name || "成員"} 支付 ${money(pending.amount)} 給 ${members.find(member => member.user.id === pending.toUserId)?.user.name || "成員"}`
              : "目前沒有待結算差額。"}
          </Text>
        </View>
        {pending && (
          <Pressable onPress={onSettle} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>已結算</Text>
          </Pressable>
        )}
      </View>
      <Modal visible={showAllTransactions} transparent animationType="slide" onRequestClose={() => setShowAllTransactions(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => setShowAllTransactions(false)} />
          <View style={[styles.modalCard, styles.modalFixedCard]}>
            <View style={styles.modalHandle} />
            <View style={styles.cardHeading}>
              <View>
                <Text style={styles.modalTitle}>完整收支</Text>
                <Text style={styles.modalDescription}>依期間查看全部收入與支出紀錄。</Text>
              </View>
              <Pressable onPress={() => setShowAllTransactions(false)} style={styles.outlineIconButton} accessibilityLabel="關閉完整收支"><MaterialCommunityIcons name="close" size={18} color={palette.rose} /></Pressable>
            </View>
            <View style={styles.segmentRow}>
              {(["week", "month", "lastMonth"] as const).map(range => (
                <Pressable key={range} onPress={() => setTransactionRange(range)} style={[styles.segment, transactionRange === range && styles.segmentActive]}>
                  <Text style={[styles.segmentText, transactionRange === range && styles.segmentTextActive]}>{range === "week" ? "本週" : range === "month" ? "本月" : "上月"}</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView style={styles.managerScroll}>
              {rangeTransactions.length ? rangeTransactions.map(tx => <TransactionRow key={tx.id} transaction={tx} categories={categories} onEdit={onEdit} onDelete={onDelete} />) : <EmptyInline text="此期間尚未有收支紀錄。" />}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const { palette } = useAppearance();
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <MaterialCommunityIcons name={icon} size={17} color={palette.rose} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function CalendarSection({
  transactions,
  categories,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  categories: Category[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const { palette } = useAppearance();
  const month = currentMonth();
  const [selected, setSelected] = useState(dateKey(new Date()));
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const cells = Array.from({ length: firstDay + days }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1
  );
  const selectedTransactions = transactions.filter(
    tx => dateKey(tx.date) === selected
  );
  const totalByDay = new Map<number, number>();
  transactions.forEach(tx => {
    const d = new Date(tx.date);
    if (d.getMonth() === monthNumber - 1 && d.getFullYear() === year)
      totalByDay.set(
        d.getDate(),
        (totalByDay.get(d.getDate()) || 0) +
          (tx.type === "expense" ? tx.amount : -tx.amount)
      );
  });
  return (
    <>
      <SectionIntro
        eyebrow="MONTHLY VIEW"
        title={`${year} 年 ${monthNumber} 月`}
        body="點選日期查看當天的收支明細。"
      />
      <View style={styles.card}>
        <View style={styles.weekRow}>
          {["日", "一", "二", "三", "四", "五", "六"].map(day => (
            <Text key={day} style={styles.weekLabel}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {cells.map((day, index) =>
            day === null ? (
              <View key={`empty-${index}`} style={styles.calendarCell} />
            ) : (
              <Pressable
                key={day}
                onPress={() =>
                  setSelected(
                    `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  )
                }
                style={[
                  styles.calendarCell,
                  selected.endsWith(`-${String(day).padStart(2, "0")}`) &&
                    styles.calendarSelected,
                ]}
              >
                <Text
                  style={[
                    styles.calendarDay,
                    selected.endsWith(`-${String(day).padStart(2, "0")}`) &&
                      styles.calendarDaySelected,
                  ]}
                >
                  {day}
                </Text>
                {totalByDay.has(day) && (
                  <View
                    style={[
                      styles.calendarDot,
                      {
                        backgroundColor:
                          (totalByDay.get(day) || 0) > 0
                            ? palette.orange
                            : palette.sage,
                      },
                    ]}
                  />
                )}
              </Pressable>
            )
          )}
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>
            {selected.slice(5).replace("-", " / ")} 明細
          </Text>
          <Text style={styles.cardHint}>{selectedTransactions.length} 筆</Text>
        </View>
        {selectedTransactions.length === 0 ? (
          <EmptyInline text="這天還沒有收支記錄。" />
        ) : (
          selectedTransactions.map(tx => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              categories={categories}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </View>
    </>
  );
}

function ExpenseDonut({
  categories,
}: {
  categories: Analytics["categories"];
}) {
  const { palette } = useAppearance();
  const size = 172;
  const strokeWidth = 23;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  let offset = 0;
  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {categories.map(category => {
          const length = total > 0 ? (category.amount / total) * circumference : 0;
          const dashOffset = -offset;
          offset += length;
          return (
            <Circle
              key={category.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={category.color || palette.rose}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={dashOffset}
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          );
        })}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutCenterLabel}>總支出</Text>
        <Text style={styles.donutCenterValue}>{money(total)}</Text>
      </View>
    </View>
  );
}

function AnalysisSection({
  analytics,
  previousAnalytics,
}: {
  analytics: Analytics | null;
  previousAnalytics: Analytics | null;
}) {
  const { palette } = useAppearance();
  const expenseChange = previousAnalytics?.expense
    ? Math.round(
        (((analytics?.expense || 0) - previousAnalytics.expense) /
          previousAnalytics.expense) *
          100
      )
    : 0;
  return (
    <>
      <SectionIntro
        eyebrow="FINANCE DASHBOARD"
        title="看見共同生活的流向"
        body="用分類與月份趨勢掌握收入、支出與餘額。"
      />
      <View style={styles.statRow}>
        <StatCard
          label="收入"
          value={money(analytics?.income || 0)}
          icon="cash-plus"
        />
        <StatCard
          label="支出"
          value={money(analytics?.expense || 0)}
          icon="cash-minus"
        />
      </View>
      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balanceLabel}>目前餘額</Text>
          <Text style={styles.balanceValue}>
            {money(analytics?.balance || 0)}
          </Text>
        </View>
        <Text style={styles.trendText}>
          {expenseChange > 0
            ? `支出較上月 +${expenseChange}%`
            : expenseChange < 0
              ? `支出較上月 ${expenseChange}%`
              : "與上月相比持平"}
        </Text>
      </View>
      {!!analytics?.categories.length && (
        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Text style={styles.cardTitle}>支出比例</Text>
            <MaterialCommunityIcons name="chart-donut" size={20} color={palette.rose} />
          </View>
          <View style={styles.donutLayout}>
            <ExpenseDonut categories={analytics.categories} />
            <View style={styles.donutLegend}>
              {analytics.categories.slice(0, 5).map(category => (
                <View key={`legend-${category.id}`} style={styles.donutLegendRow}>
                  <View style={[styles.donutLegendDot, { backgroundColor: category.color || palette.rose }]} />
                  <Text style={styles.donutLegendName} numberOfLines={1}>{category.name}</Text>
                  <Text style={styles.donutLegendAmount}>{money(category.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>支出分類</Text>
          <MaterialCommunityIcons
            name="chart-donut"
            size={20}
            color={palette.rose}
          />
        </View>
        {analytics?.categories.length ? (
          analytics.categories.map(category => {
            const max = analytics.categories[0]?.amount || 1;
            return (
              <View key={category.id} style={styles.barRow}>
                <View style={styles.barLabelRow}>
                  <Text style={styles.rowTitle}>{category.name}</Text>
                  <Text style={styles.rowAmount}>{money(category.amount)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(5, (category.amount / max) * 100)}%`,
                        backgroundColor: category.color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })
        ) : (
          <EmptyInline text="新增支出後會顯示分類圖表。" />
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>月份趨勢比較</Text>
        <View style={styles.compareRow}>
          <CompareItem
            label="本月支出"
            value={analytics?.expense || 0}
            color={palette.rose}
          />
          <CompareItem
            label="上月支出"
            value={previousAnalytics?.expense || 0}
            color="#D9C2B8"
          />
        </View>
      </View>
    </>
  );
}

function CompareItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const { palette } = useAppearance();
  return (
    <View style={styles.compareItem}>
      <View style={[styles.compareSwatch, { backgroundColor: color }]} />
      <Text style={styles.rowSubtitle}>{label}</Text>
      <Text style={styles.rowAmount}>{money(value)}</Text>
    </View>
  );
}

function PlanningSection({
  analytics,
  budgets,
  travelPlans,
  categories,
  recurring,
  onBudget,
  onEditBudget,
  onDeleteBudget,
  onTravelPlan,
  onDeleteTravelPlan,
  onRecurring,
  onEditRecurring,
  onDeleteRecurring,
}: {
  analytics: Analytics | null;
  budgets: Budget[];
  travelPlans: TravelPlan[];
  categories: Category[];
  recurring: Recurring[];
  onBudget: () => void;
  onEditBudget: (budget: Budget) => void;
  onDeleteBudget: (budget: Budget) => void;
  onTravelPlan: () => void;
  onDeleteTravelPlan: (planId: number) => void;
  onRecurring: () => void;
  onEditRecurring: (item: Recurring) => void;
  onDeleteRecurring: (item: Recurring) => void;
}) {
  const { palette } = useAppearance();
  const totalBudget = budgets.find(item => item.categoryId === 0);
  const spent = analytics?.expense || 0;
  const totalPercent = totalBudget
    ? Math.min(100, Math.round((spent / totalBudget.amount) * 100))
    : 0;
  return (
    <>
      <SectionIntro
        eyebrow="PLAN TOGETHER"
        title="預算與固定收支"
        body="先設定界線，再讓固定的生活支出自動記錄。"
      />
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View>
            <Text style={styles.cardTitle}>每月總預算</Text>
            <Text style={styles.cardHint}>
              {totalBudget
                ? `${money(spent)} / ${money(totalBudget.amount)}`
                : "尚未設定"}
            </Text>
          </View>
          <Pressable onPress={onBudget} style={styles.outlineIconButton}>
            <MaterialCommunityIcons
              name="pencil-outline"
              size={17}
              color={palette.rose}
            />
          </Pressable>
        </View>
        {totalBudget ? (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${totalPercent}%`,
                    backgroundColor:
                      totalPercent >= 100 ? "#C25C5C" : palette.rose,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.progressHint,
                totalPercent >= 100 && styles.warningText,
              ]}
            >
              {totalPercent >= 100
                ? "已超過本月總預算，請留意支出。"
                : `已使用 ${totalPercent}%`}
            </Text>
          </>
        ) : (
          <Pressable onPress={onBudget} style={styles.dashedButton}>
            <Text style={styles.dashedButtonText}>設定每月總預算</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View>
            <Text style={styles.cardTitle}>出遊規劃</Text>
            <Text style={styles.cardHint}>獨立於每月預算</Text>
          </View>
          <Pressable onPress={onTravelPlan} style={styles.outlineIconButton}>
            <MaterialCommunityIcons name="map-plus" size={18} color={palette.rose} />
          </Pressable>
        </View>
        {travelPlans.length === 0 ? (
          <EmptyInline text="安排旅行或聚會預算，日期範圍不會影響每月預算。" />
        ) : (
          travelPlans.map(plan => (
            <View key={plan.id} style={styles.travelPlanRow}>
              <View style={styles.travelPlanIcon}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color={palette.rose} />
              </View>
              <View style={styles.memberPaymentName}>
                <Text style={styles.rowTitle}>{plan.name}</Text>
                <Text style={styles.rowSubtitle}>{dateKey(plan.startDate)} 至 {dateKey(plan.endDate)} · {money(plan.budget)}</Text>
                {!!plan.notes && <Text style={styles.rowSubtitle}>{plan.notes}</Text>}
              </View>
              <Pressable onPress={() => onDeleteTravelPlan(plan.id)} style={styles.rowActionButton} accessibilityLabel={`刪除${plan.name}`}>
                <MaterialCommunityIcons name="trash-can-outline" size={17} color={palette.rose} />
              </Pressable>
            </View>
          ))
        )}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>分類預算</Text>
          <Text style={styles.cardHint}>
            {budgets.filter(item => item.categoryId !== 0).length} 項
          </Text>
        </View>
        {budgets
          .filter(item => item.categoryId !== 0)
          .map(budget => {
            const category = categories.find(
              item => item.id === budget.categoryId
            );
            const amount =
              analytics?.categories.find(item => item.id === budget.categoryId)
                ?.amount || 0;
            const percent = Math.min(
              100,
              Math.round((amount / budget.amount) * 100)
            );
            return (
              <View key={budget.id} style={styles.budgetRow}>
                <View style={styles.barLabelRow}>
                  <Text style={styles.rowTitle}>
                    {categoryEmoji(category)} {category?.name || "分類"}
                  </Text>
                  <Text style={styles.rowAmount}>
                    {money(amount)} / {money(budget.amount)}
                  </Text>
                  <View style={styles.transactionActions}>
                    <Pressable accessibilityLabel={`編輯${category?.name || "分類"}預算`} onPress={() => onEditBudget(budget)} style={styles.rowActionButton}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={palette.muted} />
                    </Pressable>
                    <Pressable accessibilityLabel={`刪除${category?.name || "分類"}預算`} onPress={() => onDeleteBudget(budget)} style={styles.rowActionButton}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={palette.rose} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(percent ? 5 : 0, percent)}%`,
                        backgroundColor:
                          percent >= 100 ? "#C25C5C" : palette.sage,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        {budgets.filter(item => item.categoryId !== 0).length === 0 && (
          <EmptyInline text="尚未設定分類預算。" />
        )}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>固定收支</Text>
          <Pressable onPress={onRecurring} style={styles.outlineIconButton}>
            <MaterialCommunityIcons name="plus" size={18} color={palette.rose} />
          </Pressable>
        </View>
        {recurring.length === 0 ? (
          <EmptyInline text="沒有固定收入或支出；新增後會在每月開啟帳本時自動補記。" />
        ) : (
          recurring.map(item => (
            <View key={item.id} style={styles.recurringRow}>
              <View style={styles.recurringIcon}>
                <MaterialCommunityIcons
                  name={item.type === "expense" ? "cash-minus" : "cash-plus"}
                  size={18}
                  color={item.type === "expense" ? palette.rose : palette.sage}
                />
              </View>
              <View style={styles.memberPaymentName}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>
                  {item.frequency === "monthly"
                    ? `每月 ${item.dayOfMonth} 日`
                    : item.frequency === "weekly"
                      ? "每週"
                      : "每年"}
                </Text>
              </View>
              <Text style={styles.rowAmount}>
                {item.type === "expense" ? "-" : "+"}
                {money(item.amount)}
              </Text>
              <View style={styles.transactionActions}>
                <Pressable accessibilityLabel={`編輯固定收支${item.title}`} onPress={() => onEditRecurring(item)} style={styles.rowActionButton}>
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={palette.muted} />
                </Pressable>
                <Pressable accessibilityLabel={`刪除固定收支${item.title}`} onPress={() => onDeleteRecurring(item)} style={styles.rowActionButton}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={palette.rose} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
}

function PersonalSettingsPage({
  user,
  error,
  notificationPreferences,
  onSaveNotificationPreferences,
  onUpdateNickname,
  onCheckForUpdate,
  appUpdateStatus,
  appUpdateProgress,
  onLogout,
  onDeleteAccount,
  onBack,
}: {
  user: User;
  error: string;
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => void | Promise<void>;
  onUpdateNickname: (name: string) => void | Promise<void>;
  onCheckForUpdate: () => void;
  appUpdateStatus: AppUpdateStatus;
  appUpdateProgress: number;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onBack: () => void;
}) {
  const { preferences, palette, updatePreferences } = useAppearance();
  const [nickname, setNickname] = useState(user.name || "");
  const [notificationDraft, setNotificationDraft] = useState<NotificationPreferences>(() => normalizeNotificationPreferences(notificationPreferences));
  const notificationDraftRef = useRef(notificationDraft);
  useEffect(() => { notificationDraftRef.current = notificationDraft; }, [notificationDraft]);
  useEffect(() => {
    const next = normalizeNotificationPreferences(notificationPreferences);
    const current = notificationDraftRef.current;
    const differs = current.incomeEnabled !== next.incomeEnabled || current.expenseEnabled !== next.expenseEnabled || current.minimumAmount !== next.minimumAmount || current.monthlySettlementEnabled !== next.monthlySettlementEnabled || current.monthlyReminderDay !== next.monthlyReminderDay;
    if (differs) setNotificationDraft(next);
  }, [notificationPreferences]);
  const themes: Array<{ key: AppearanceTheme; label: string; color: string }> = [
    { key: "rose", label: "玫瑰", color: "#B56C78" },
    { key: "cherry", label: "櫻花", color: "#CE6D91" },
    { key: "graphite", label: "石墨", color: "#58677A" },
    { key: "latte", label: "拿鐵", color: "#B87955" },
    { key: "mint", label: "薄荷", color: "#4D9381" },
    { key: "ocean", label: "海洋", color: "#397D9B" },
    { key: "sunset", label: "夕暮", color: "#D17B61" },
    { key: "starry", label: "星空", color: "#6D63B8" },
    { key: "forest", label: "森林", color: "#5A956F" },
    { key: "meadow", label: "草原", color: "#7B9B43" },
    { key: "snow", label: "雪地", color: "#5A8BA5" },
    { key: "lavender", label: "薰衣草", color: "#9C6BB3" },
  ];
  const fonts: Array<{ key: AppearanceFont; label: string; preview: string }> = [
    { key: "system", label: "系統", preview: "Aa" },
    { key: "rounded", label: "圓體", preview: "Aa" },
    { key: "serif", label: "襯線", preview: "Aa" },
    { key: "clean", label: "清爽細字", preview: "Aa" },
    { key: "mono", label: "等寬", preview: "Aa" },
  ];
  const scales: Array<{ key: AppearanceScale; label: string }> = [
    { key: "tiny", label: "特小" },
    { key: "small", label: "小" },
    { key: "standard", label: "標準" },
    { key: "large", label: "大" },
    { key: "xl", label: "特大" },
  ];
  const cardStyles: Array<{ key: AppearanceCardStyle; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; hint: string }> = [
    { key: "soft", label: "柔和卡片", icon: "card-outline", hint: "圓角與柔和層次" },
    { key: "outlined", label: "清晰邊框", icon: "border-all", hint: "邊界更明確" },
    { key: "flat", label: "純淨平面", icon: "view-agenda-outline", hint: "減少卡片框線" },
  ];
  const navStyles: Array<{ key: AppearanceNavStyle; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
    { key: "pill", label: "膠囊選取", icon: "view-dashboard-outline" },
    { key: "line", label: "底線選取", icon: "format-align-bottom" },
    { key: "minimal", label: "極簡導覽", icon: "dots-horizontal" },
  ];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={["bottom"]}>
      <ThemeAtmosphere />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.select({ ios: "padding", android: "height" })} keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
      <ScrollView contentContainerStyle={styles.profileContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <SectionIntro
          eyebrow="YOUR SPACE"
          title="把共帳調成你的樣子"
          body="這些偏好只會影響你的裝置，不會改變共同帳本資料。"
        />
        {!!error && <Text style={styles.globalError}>{error}</Text>}
        <View style={styles.profileSettingsShell}>
        <View style={styles.settingsGroupCard}>
          <View style={styles.cardHeading}>
        <View style={styles.personalizationHeading}>
          <MaterialCommunityIcons name="account-cog-outline" size={19} color={palette.rose} />
          <Text style={styles.cardTitle}>個人設定</Text>
        </View>
        <Text style={styles.cardHint}>主頁可調整</Text>
      </View>
      <Text style={styles.cardHint}>主題、字體與版型會立即套用並保存在這台裝置；共同帳本資料不會因此改變。</Text>
      <Text style={styles.personalizationLabel}>使用者暱稱</Text>
      <TextInput
        value={nickname}
        onChangeText={setNickname}
        placeholder="輸入你想顯示的暱稱"
        placeholderTextColor={palette.muted}
maxLength={64}
returnKeyType="done"
style={styles.input}
      />
      <Pressable
        onPress={() => void onUpdateNickname(nickname)}
        style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
      >
        <Text style={styles.smallButtonText}>儲存暱稱</Text>
      </Pressable>
<Text style={styles.rowSubtitle}>
暱稱會顯示在帳本成員與操作日誌中。
</Text>
	      </View>
	      <View style={styles.settingsGroupCard}>
	      <View style={styles.cardHeading}>
	        <View style={styles.personalizationHeading}>
	          <MaterialCommunityIcons name="palette-outline" size={19} color={palette.rose} />
	          <Text style={styles.cardTitle}>外觀與介面</Text>
	        </View>
	      </View>
	      <Text style={styles.cardHint}>主題、字體與版型會立即套用並保存在這台裝置。</Text>
	<Text style={styles.personalizationLabel}>App 主題</Text>
      <View style={styles.optionRow}>
        {themes.map(theme => (
          <Pressable
            key={theme.key}
            onPress={() => updatePreferences({ theme: theme.key })}
            style={[
              styles.appearanceOption,
              preferences.theme === theme.key && styles.appearanceOptionActive,
            ]}
          >
            <View style={[styles.themeDot, { backgroundColor: theme.color }]} />
            <Text style={styles.appearanceOptionText}>{theme.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.personalizationLabel}>字體</Text>
      <View style={styles.optionRow}>
        {fonts.map(font => (
          <Pressable
            key={font.key}
            onPress={() => updatePreferences({ font: font.key })}
            style={[
              styles.appearanceOption,
              preferences.font === font.key && styles.appearanceOptionActive,
            ]}
          >
            <Text style={[styles.fontPreview, { fontFamily: appearanceFontMap[font.key] }]}>{font.preview}</Text>
            <Text style={styles.appearanceOptionText}>{font.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.personalizationLabel}>文字大小</Text>
      <View style={styles.optionRow}>
        {scales.map(scale => (
          <Pressable
            key={scale.key}
            onPress={() => updatePreferences({ scale: scale.key })}
            style={[
              styles.appearanceOption,
              preferences.scale === scale.key && styles.appearanceOptionActive,
            ]}
          >
            <Text style={styles.appearanceOptionText}>{scale.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.personalizationLabel}>介面卡片樣式</Text>
      <View style={styles.appearanceGrid}>
        {cardStyles.map(option => (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={`選擇${option.label}`}
            onPress={() => updatePreferences({ cardStyle: option.key })}
            style={[
              styles.appearanceStyleOption,
              preferences.cardStyle === option.key && styles.appearanceOptionActive,
            ]}
          >
            <MaterialCommunityIcons name={option.icon} size={18} color={palette.rose} />
            <View style={styles.appearanceStyleCopy}>
              <Text style={styles.appearanceOptionText}>{option.label}</Text>
              <Text style={styles.appearanceStyleHint}>{option.hint}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.personalizationLabel}>底部導覽樣式</Text>
      <View style={styles.optionRow}>
        {navStyles.map(option => (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={`選擇${option.label}`}
            onPress={() => updatePreferences({ navStyle: option.key })}
            style={[
              styles.appearanceOption,
              preferences.navStyle === option.key && styles.appearanceOptionActive,
            ]}
          >
            <MaterialCommunityIcons name={option.icon} size={17} color={palette.rose} />
            <Text style={styles.appearanceOptionText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.rowTitle}>緊湊清單</Text>
          <Text style={styles.rowSubtitle}>讓交易與帳本列表顯示更多內容</Text>
        </View>
        <Switch value={preferences.compactMode} onValueChange={value => updatePreferences({ compactMode: value })} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={preferences.compactMode ? palette.rose : palette.muted} />
      </View>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.rowTitle}>減少動態效果</Text>
          <Text style={styles.rowSubtitle}>降低切換時的視覺動態，適合需要穩定畫面時使用</Text>
        </View>
        <Switch value={preferences.reduceMotion} onValueChange={value => updatePreferences({ reduceMotion: value })} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={preferences.reduceMotion ? palette.rose : palette.muted} />
      </View>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.rowTitle}>掃描自動填入摘要</Text>
          <Text style={styles.rowSubtitle}>辨識到店家或品項時，自動放入備註欄</Text>
        </View>
<Switch value={preferences.autoReceiptNote} onValueChange={value => updatePreferences({ autoReceiptNote: value })} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={preferences.autoReceiptNote ? palette.rose : palette.muted} />
</View>
	  <View style={styles.preferenceRow}>
	    <View style={styles.preferenceCopy}>
	      <Text style={styles.rowTitle}>僅 Wi‑Fi 自動下載更新</Text>
	      <Text style={styles.rowSubtitle}>啟動時發現新版本，僅在 Wi‑Fi 下自動下載；行動網路可手動選擇更新。</Text>
	    </View>
	    <Switch value={preferences.autoDownloadUpdatesOnWifi} onValueChange={value => updatePreferences({ autoDownloadUpdatesOnWifi: value })} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={preferences.autoDownloadUpdatesOnWifi ? palette.rose : palette.muted} />
	  </View>
	      </View>
	      <View style={styles.settingsGroupCard}>
	      <View style={styles.cardHeading}>
	        <View style={styles.personalizationHeading}>
	          <MaterialCommunityIcons name="bell-cog-outline" size={19} color={palette.rose} />
	          <Text style={styles.cardTitle}>提醒與通知</Text>
	        </View>
	      </View>
      <Text style={styles.cardHint}>可個別關閉收入、支出與月結算提醒；啟用後才會要求手機通知權限。</Text>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.rowTitle}>每月結算提醒</Text>
          <Text style={styles.rowSubtitle}>在選定日期提醒你檢查共同帳本結算</Text>
        </View>
        <Switch value={notificationDraft.monthlySettlementEnabled === 1} onValueChange={value => setNotificationDraft(current => ({ ...current, monthlySettlementEnabled: value ? 1 : 0 }))} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={notificationDraft.monthlySettlementEnabled ? palette.rose : palette.muted} />
      </View>
      <Text style={styles.personalizationLabel}>每月提醒日期（1–28 日）</Text>
      <Text style={styles.rowSubtitle}>直接點選日期，不需要手動輸入。</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reminderDayPicker}>
        {Array.from({ length: 28 }, (_, index) => index + 1).map(day => {
          const selected = notificationDraft.monthlyReminderDay === day;
          return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`每月 ${day} 日提醒`} onPress={() => setNotificationDraft(current => ({ ...current, monthlyReminderDay: day }))} style={[styles.reminderDay, selected && styles.reminderDayActive]}>
            <Text style={[styles.reminderDayText, selected && styles.reminderDayTextActive]}>{day}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.rowTitle}>收入通知</Text>
          <Text style={styles.rowSubtitle}>帳本成員新增收入時提醒</Text>
        </View>
        <Switch value={notificationDraft.incomeEnabled === 1} onValueChange={value => setNotificationDraft(current => ({ ...current, incomeEnabled: value ? 1 : 0 }))} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={notificationDraft.incomeEnabled ? palette.rose : palette.muted} />
      </View>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.rowTitle}>支出通知</Text>
          <Text style={styles.rowSubtitle}>帳本成員新增支出時提醒</Text>
        </View>
        <Switch value={notificationDraft.expenseEnabled === 1} onValueChange={value => setNotificationDraft(current => ({ ...current, expenseEnabled: value ? 1 : 0 }))} trackColor={{ false: palette.border, true: palette.roseSoft }} thumbColor={notificationDraft.expenseEnabled ? palette.rose : palette.muted} />
      </View>
      <Text style={styles.personalizationLabel}>通知金額門檻（NT$）</Text>
<TextInput value={String(notificationDraft.minimumAmount)} onChangeText={value => setNotificationDraft(current => ({ ...current, minimumAmount: Number(value.replace(/\D/g, "")) || 0 }))} keyboardType="number-pad" maxLength={9} placeholder="0 代表所有金額都提醒" placeholderTextColor={palette.muted} style={styles.input} />
      <Pressable onPress={() => void onSaveNotificationPreferences(notificationDraft)} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
<MaterialCommunityIcons name="bell-check-outline" size={17} color="#FFFFFF" />
<Text style={styles.smallButtonText}>儲存提醒設定</Text>
</Pressable>
	      </View>
	      <View style={styles.settingsGroupCard}>
	      <View style={styles.cardHeading}>
	        <View style={styles.personalizationHeading}>
	          <MaterialCommunityIcons name="rocket-launch-outline" size={19} color={palette.rose} />
	          <Text style={styles.cardTitle}>專案與帳號</Text>
	        </View>
	      </View>
      <View style={styles.preferenceRow}>
        <View style={styles.preferenceCopy}>
<Text style={styles.rowTitle}>Together Ledger GitHub</Text>
<Text style={styles.rowSubtitle}>查看專案介紹、問題回報與開發更新</Text>
          <Text style={styles.appVersionText}>目前版本 v{APP_VERSION}</Text>
</View>
        <Pressable onPress={() => void Linking.openURL(GITHUB_REPOSITORY_URL)} style={styles.iconButton} accessibilityLabel="開啟 GitHub 專案頁">
          <MaterialCommunityIcons name="github" size={20} color={palette.rose} />
        </Pressable>
      </View>
      <Pressable disabled={appUpdateStatus !== "idle"} onPress={onCheckForUpdate} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed, appUpdateStatus !== "idle" && styles.disabled]} accessibilityLabel="在 App 內檢查並下載更新">
        {appUpdateStatus === "idle" ? <MaterialCommunityIcons name="download-circle-outline" size={18} color={palette.rose} /> : <ActivityIndicator size="small" color={palette.rose} />}
        <Text style={styles.outlineButtonText}>
          {appUpdateStatus === "checking" ? "正在檢查更新…" : appUpdateStatus === "downloading" ? `正在下載更新 ${appUpdateProgress}%` : appUpdateStatus === "installing" ? "正在開啟安裝確認…" : "在 App 內檢查並下載更新"}
        </Text>
      </Pressable>
      <Pressable
        onPress={onLogout}
        style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="logout" size={17} color={palette.rose} />
        <Text style={styles.outlineButtonText}>登出帳號</Text>
      </Pressable>
      <View style={[styles.accountDeletePanel, { borderColor: palette.rose }]}>
        <View style={styles.preferenceCopy}>
          <Text style={[styles.rowTitle, { color: palette.rose }]}>刪除帳號</Text>
          <Text style={styles.rowSubtitle}>需要再次輸入密碼。帳本會依成員狀況轉讓或移除，無法復原。</Text>
        </View>
        <Pressable onPress={onDeleteAccount} style={({ pressed }) => [styles.accountDeleteButton, { backgroundColor: palette.rose }, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="delete-outline" size={17} color="#FFFFFF" />
          <Text style={styles.accountDeleteButtonText}>刪除帳號</Text>
        </Pressable>
      </View>
      <Pressable onPress={onBack} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="arrow-left" size={17} color={palette.rose} />
        <Text style={styles.secondaryButtonText}>返回我的帳本</Text>
      </Pressable>
        </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SettingsSection({
  ledger,
  user,
  members,
  categories,
  paymentMethods,
  history,
  activityLogs,
  onCategory,
  onPayment,
  onArchiveCategory,
  onArchivePayment,
  onDeleteCategory,
  onDeletePayment,
  onRefresh,
  onLeaveLedger,
  onRenameLedger,
  onTransferOwnership,
  onRoleChange,
}: {
  ledger: Ledger;
  user: User;
  members: LedgerMember[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
    history: SettlementHistory[];
  activityLogs: ActivityLog[];
  onCategory: () => void;
  onPayment: () => void;
  onArchiveCategory: (categoryId: number) => void;
  onArchivePayment: (paymentMethodId: number) => void;
  onDeleteCategory: (categoryId: number) => void;
  onDeletePayment: (paymentMethodId: number) => void;
  onRefresh: () => void;
  onLeaveLedger: () => void;
  onRenameLedger: () => void;
  onTransferOwnership: () => void;
  onRoleChange: (memberId: number, role: "admin" | "member" | "viewer") => void;
}) {
  const { palette } = useAppearance();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = members.find(item => item.user.id === user.id);
  const isAdmin = me?.member.role === "admin";
  const inviteLink = `togetherledger://join?code=${ledger.inviteCode}`;
  const shareInvite = async () => {
    await Share.share({
      message: `加入我的共帳「${ledger.name}」\n邀請碼：${ledger.inviteCode}\n邀請連結：${inviteLink}`,
    });
  };
  const copyInviteCode = async () => {
    await Clipboard.setStringAsync(ledger.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const addPresets = async () => {
    const presets = [
      { name: "飲食", icon: "🍜", type: "expense" as const },
      { name: "交通", icon: "🚗", type: "expense" as const },
      { name: "生活", icon: "🏠", type: "expense" as const },
      { name: "購物", icon: "🛍️", type: "expense" as const },
      { name: "情侶", icon: "💕", type: "expense" as const },
      { name: "薪資", icon: "💰", type: "income" as const },
    ];
    for (const preset of presets.filter(
      item =>
        !categories.some(
          category => category.name === item.name && category.type === item.type
        )
    ))
      await api.ledger.createCategory.mutate({
        ledgerId: ledger.id,
        parentCategoryId: 0,
        name: preset.name,
        type: preset.type,
        icon: preset.icon,
        color: palette.rose,
      });
    onRefresh();
  };
  const addPaymentPresets = async () => {
    const presets = [
      { name: "現金", icon: "💵" },
      { name: "信用卡", icon: "💳" },
      { name: "電子支付", icon: "📱" },
      { name: "銀行轉帳", icon: "🏦" },
    ];
    for (const preset of presets.filter(
      item => !paymentMethods.some(method => method.name === item.name)
    ))
      await api.ledger.createPaymentMethod.mutate({
        ledgerId: ledger.id,
        ...preset,
      });
    onRefresh();
  };
  const [categoryQuery, setCategoryQuery] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [showInactiveCategories, setShowInactiveCategories] = useState(false);
  const [showInactivePayments, setShowInactivePayments] = useState(false);
  const [categorySort, setCategorySort] = useState<"name" | "status">("name");
  const [paymentSort, setPaymentSort] = useState<"name" | "status">("name");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentMethod | null>(null);
  const [draftCategoryName, setDraftCategoryName] = useState("");
  const [draftCategoryIcon, setDraftCategoryIcon] = useState("");
  const [draftCategoryType, setDraftCategoryType] = useState<"expense" | "income">("expense");
  const [draftPaymentName, setDraftPaymentName] = useState("");
  const [draftPaymentIcon, setDraftPaymentIcon] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [managerModal, setManagerModal] = useState<"category" | "payment" | "activity" | null>(null);
  const [activityFilter, setActivityFilter] = useState<"all" | "transaction" | "settings" | "members">("all");
  const [pendingItemAction, setPendingItemAction] = useState<{
    kind: "category" | "payment";
    id: number;
    name: string;
  } | null>(null);
  const visibleCategories = [...categories]
    .filter(item => {
      const matchesQuery = `${item.name} ${item.icon}`.toLowerCase().includes(categoryQuery.trim().toLowerCase());
      return matchesQuery && (showInactiveCategories || item.isActive !== 0);
    })
    .sort((left, right) =>
      categorySort === "status"
        ? Number(right.isActive || 0) - Number(left.isActive || 0) || left.name.localeCompare(right.name, "zh-Hant")
        : left.name.localeCompare(right.name, "zh-Hant")
    );
  const visiblePayments = [...paymentMethods]
    .filter(item => {
      const matchesQuery = `${item.name} ${item.icon}`.toLowerCase().includes(paymentQuery.trim().toLowerCase());
      return matchesQuery && (showInactivePayments || item.isActive !== 0);
    })
    .sort((left, right) =>
      paymentSort === "status"
        ? Number(right.isActive || 0) - Number(left.isActive || 0) || left.name.localeCompare(right.name, "zh-Hant")
        : left.name.localeCompare(right.name, "zh-Hant")
    );
  const categoryPreview = visibleCategories.slice(0, 4);
  const paymentPreview = visiblePayments.slice(0, 4);
  const activityFilters = [
    { key: "all", label: "全部" },
    { key: "transaction", label: "收支" },
    { key: "settings", label: "設定" },
    { key: "members", label: "成員" },
  ] as const;
  const activityKind = (item: ActivityLog) => {
    const haystack = `${item.log.entityType} ${item.log.action} ${item.log.summary || ""}`.toLowerCase();
    if (/transaction|expense|income|settlement|budget|recurring|收支|結算|預算|固定/.test(haystack)) return "transaction";
    if (/member|invite|role|owner|member/.test(haystack)) return "members";
    return "settings";
  };
  const filteredActivityLogs = activityLogs.filter(item => activityFilter === "all" || activityKind(item) === activityFilter);
  const resolveItemAction = async (choice: "archive" | "delete") => {
    const target = pendingItemAction;
    if (!target) return;
    setPendingItemAction(null);
    if (target.kind === "category") {
      if (choice === "archive") onArchiveCategory(target.id);
      else onDeleteCategory(target.id);
    } else if (choice === "archive") onArchivePayment(target.id);
    else onDeletePayment(target.id);
  };
  const startEditCategory = (item: Category) => {
    setEditingCategory(item);
    setDraftCategoryName(item.name);
    setDraftCategoryIcon(categoryEmoji(item));
    setDraftCategoryType(item.type);
  };
  const startEditPayment = (item: PaymentMethod) => {
    setEditingPayment(item);
    setDraftPaymentName(item.name);
    setDraftPaymentIcon(paymentEmoji(item));
  };
  const saveCategory = async () => {
    if (!editingCategory || !draftCategoryName.trim()) return;
    setSettingsBusy(true);
    try {
      await api.ledger.updateCategory.mutate({ ledgerId: ledger.id, categoryId: editingCategory.id, name: draftCategoryName.trim(), icon: categoryEmoji({ name: draftCategoryName, icon: draftCategoryIcon }), type: draftCategoryType, color: editingCategory.color });
      setEditingCategory(null);
      onRefresh();
    } finally {
      setSettingsBusy(false);
    }
  };
  const savePayment = async () => {
    if (!editingPayment || !draftPaymentName.trim()) return;
    setSettingsBusy(true);
    try {
      await api.ledger.updatePaymentMethod.mutate({ ledgerId: ledger.id, paymentMethodId: editingPayment.id, name: draftPaymentName.trim(), icon: paymentEmoji({ name: draftPaymentName, icon: draftPaymentIcon }) });
      setEditingPayment(null);
      onRefresh();
    } finally {
      setSettingsBusy(false);
    }
  };
  const restoreCategory = async (item: Category) => {
    await api.ledger.setCategoryActive.mutate({ ledgerId: ledger.id, categoryId: item.id, isActive: 1 });
    onRefresh();
  };
  const restorePayment = async (item: PaymentMethod) => {
    await api.ledger.setPaymentMethodActive.mutate({ ledgerId: ledger.id, paymentMethodId: item.id, isActive: 1 });
    onRefresh();
  };
  return (
    <>
      <SectionIntro
        eyebrow="LEDGER SETTINGS"
        title="把共同空間設定好"
        body="帳本不會預先建立交易、預算或固定收支；分類與支付方式支援完整自訂或重置。"
      />
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.personalizationHeading}>
            <MaterialCommunityIcons name="account-switch-outline" size={19} color={palette.rose} />
            <Text style={styles.cardTitle}>帳本管理</Text>
          </View>
        </View>
        <Text style={styles.rowSubtitle}>名稱、持有者與成員權限可以分開管理，避免為了交接而被迫退出。</Text>
        <View style={styles.settingsActionGrid}>
          <Pressable onPress={onRenameLedger} style={styles.settingsActionButton}>
            <MaterialCommunityIcons name="pencil-outline" size={17} color={palette.rose} />
            <Text style={styles.settingsActionText}>修改帳本名稱</Text>
          </Pressable>
          {isAdmin && members.length > 1 && (
            <Pressable onPress={onTransferOwnership} style={styles.settingsActionButton}>
              <MaterialCommunityIcons name="account-switch-outline" size={17} color={palette.rose} />
              <Text style={styles.settingsActionText}>直接轉讓所有權</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.personalizationHeading}>
            <MaterialCommunityIcons name="exit-to-app" size={19} color={palette.rose} />
            <Text style={styles.cardTitle}>帳本生命週期</Text>
          </View>
        </View>
        <Text style={styles.rowSubtitle}>
          成員可退出帳本；持有者需要先轉讓給其他成員，或確認刪除整本帳本。
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="退出或移除目前帳本"
          onPress={onLeaveLedger}
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="exit-to-app" size={18} color={palette.rose} />
          <Text style={styles.dangerButtonText}>退出／移除目前帳本</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>邀請成員</Text>
          <Pressable onPress={shareInvite} style={styles.outlineIconButton}>
            <MaterialCommunityIcons
              name="share-variant"
              size={18}
              color={palette.rose}
            />
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel="複製邀請碼"
          accessibilityRole="button"
          onPress={copyInviteCode}
          style={({ pressed }) => [styles.inviteCodeCopy, pressed && styles.pressed]}
        >
          <Text style={styles.inviteCodeLarge}>{ledger.inviteCode}</Text>
          <View style={styles.inviteCopyHint}>
            <MaterialCommunityIcons name={copied ? "check-circle-outline" : "content-copy"} size={16} color={palette.rose} />
            <Text style={styles.inviteCopyHintText}>{copied ? "已複製邀請碼" : "點擊複製"}</Text>
          </View>
        </Pressable>
        <Text style={styles.rowSubtitle}>
          邀請碼可分享給伴侶、室友或家人；也支援 deep link 邀請。
        </Text>
        <Pressable
          onPress={() => setShowQr(value => !value)}
          style={styles.dashedButton}
        >
          <MaterialCommunityIcons name="qrcode" size={17} color={palette.rose} />
          <Text style={styles.dashedButtonText}>
            {showQr ? "收起 QR Code" : "顯示 QR Code"}
          </Text>
        </Pressable>
        {showQr && (
          <View style={styles.qrWrap}>
            <QRCode
              value={inviteLink}
              size={156}
              color={palette.ink}
              backgroundColor={palette.surface}
            />
            <Text style={styles.qrCaption}>{inviteLink}</Text>
          </View>
        )}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>成員與權限</Text>
          <Text style={styles.cardHint}>{members.length} 位</Text>
        </View>
        <Text style={styles.rowSubtitle}>
          支援管理員、可編輯成員與檢視者；目前不提供任意自訂權限組合。
        </Text>
        {members.map(item => (
          <View key={item.user.id} style={styles.memberPaymentRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.user.name || item.user.email || "成").slice(0, 1)}
              </Text>
            </View>
            <View style={styles.memberPaymentName}>
              <Text style={styles.rowTitle}>
                {item.user.id === user.id
                  ? "你"
                  : item.user.name || item.user.email || "成員"}
              </Text>
              <Text style={styles.rowSubtitle}>
                {item.member.role === "admin"
                  ? "管理員"
                  : item.member.role === "viewer"
                    ? "檢視者"
                    : "可編輯成員"}
              </Text>
            </View>
            {isAdmin && item.user.id !== user.id ? (
              <Pressable
                onPress={() =>
                  onRoleChange(
                    item.user.id,
                    item.member.role === "member"
                      ? "admin"
                      : item.member.role === "admin"
                        ? "viewer"
                        : "member"
                  )
                }
                style={styles.rolePill}
              >
                <Text style={styles.rolePillText}>
                  {item.member.role === "member"
                    ? "設為管理員"
                    : item.member.role === "admin"
                      ? "改檢視"
                      : "允許編輯"}
                </Text>
              </Pressable>
            ) : (
              <MaterialCommunityIcons
                name="shield-account-outline"
                size={20}
                color={palette.muted}
              />
            )}
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.personalizationHeading}>
            <MaterialCommunityIcons name="shape-outline" size={19} color={palette.rose} />
            <Text style={styles.cardTitle}>分類管理</Text>
          </View>
          <Pressable onPress={onCategory} style={styles.outlineIconButton} accessibilityLabel="新增分類">
            <MaterialCommunityIcons name="plus" size={18} color={palette.rose} />
          </Pressable>
        </View>
        <Text style={styles.rowSubtitle}>顯示前 {categoryPreview.length} 項 · {categories.length} 個分類</Text>
        {categoryPreview.length ? <View style={styles.settingsPreviewRow}>{categoryPreview.map(item => <View key={item.id} style={styles.settingsPreviewChip}><Text style={styles.settingsPreviewEmoji}>{categoryEmoji(item)}</Text><Text style={styles.settingsPreviewText} numberOfLines={1}>{item.name}</Text></View>)}</View> : <EmptyInline text="目前沒有分類。" />}
        <View style={styles.settingsManagerActions}>
          {categories.length === 0 && <Pressable onPress={addPresets} style={styles.settingsManagerButton}><Text style={styles.settingsManagerText}>加入建議</Text></Pressable>}
          <Pressable onPress={() => setManagerModal("category")} style={styles.settingsManagerButton} accessibilityLabel="管理所有分類"><MaterialCommunityIcons name="format-list-bulleted" size={17} color={palette.rose} /><Text style={styles.settingsManagerText}>管理全部</Text></Pressable>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.personalizationHeading}>
            <MaterialCommunityIcons name="credit-card-settings-outline" size={19} color={palette.rose} />
            <Text style={styles.cardTitle}>支付方式管理</Text>
          </View>
          <Pressable onPress={onPayment} style={styles.outlineIconButton} accessibilityLabel="新增支付方式">
            <MaterialCommunityIcons name="plus" size={18} color={palette.rose} />
          </Pressable>
        </View>
        <Text style={styles.rowSubtitle}>顯示前 {paymentPreview.length} 項 · {paymentMethods.length} 種方式</Text>
        {paymentPreview.length ? <View style={styles.settingsPreviewRow}>{paymentPreview.map(item => <View key={item.id} style={styles.settingsPreviewChip}><Text style={styles.settingsPreviewEmoji}>{paymentEmoji(item)}</Text><Text style={styles.settingsPreviewText} numberOfLines={1}>{item.name}</Text></View>)}</View> : <EmptyInline text="目前沒有支付方式。" />}
        <View style={styles.settingsManagerActions}>
          {paymentMethods.length === 0 && <Pressable onPress={addPaymentPresets} style={styles.settingsManagerButton}><Text style={styles.settingsManagerText}>加入建議</Text></Pressable>}
          <Pressable onPress={() => setManagerModal("payment")} style={styles.settingsManagerButton} accessibilityLabel="管理所有支付方式"><MaterialCommunityIcons name="format-list-bulleted" size={17} color={palette.rose} /><Text style={styles.settingsManagerText}>管理全部</Text></Pressable>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>操作日誌</Text>
          <Text style={styles.cardHint}>{activityLogs.length} 筆</Text>
        </View>
        <Text style={styles.rowSubtitle}>{activityLogs.length ? "所有帳本異動會保留時間、操作者與動作紀錄。" : "尚未有操作紀錄。"}</Text>
        <Pressable onPress={() => setManagerModal("activity")} style={styles.settingsManagerButton} accessibilityLabel="查看完整操作日誌"><MaterialCommunityIcons name="clipboard-text-clock-outline" size={17} color={palette.rose} /><Text style={styles.settingsManagerText}>查看完整日誌</Text></Pressable>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>結算紀錄</Text>
          <Text style={styles.cardHint}>{history.length} 筆</Text>
        </View>
        {history.length === 0 ? (
          <EmptyInline text="尚未有已結算紀錄。" />
        ) : (
          history.slice(0, 6).map(item => {
            const from = members.find(member => member.user.id === item.fromUserId)?.user;
            const to = members.find(member => member.user.id === item.toUserId)?.user;
            return (
              <View key={item.id} style={styles.historyRow}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="check" size={16} color={palette.sage} />
                </View>
                <View style={styles.memberPaymentName}>
                  <Text style={styles.rowTitle}>{monthLabel(item.month)} 已結算</Text>
                  <Text style={styles.rowSubtitle}>
                    {from?.name || from?.email || "成員"} → {to?.name || to?.email || "成員"}
                  </Text>
                </View>
                <Text style={styles.historyAmount}>{money(item.amount)}</Text>
              </View>
            );
          })
        )}
            </View>
      <Modal visible={managerModal !== null} transparent animationType="slide" onRequestClose={() => { setPendingItemAction(null); setManagerModal(null); }}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => { setPendingItemAction(null); setManagerModal(null); }} />
          <View style={[styles.modalCard, styles.modalFixedCard]}>
            <View style={styles.modalHandle} />
            <View style={styles.cardHeading}>
              <View style={styles.memberPaymentName}>
                <Text style={styles.modalTitle}>{pendingItemAction ? `管理「${pendingItemAction.name}」` : managerModal === "category" ? "分類管理" : managerModal === "payment" ? "支付方式管理" : "操作日誌"}</Text>
                <Text style={styles.modalDescription}>{pendingItemAction ? "請選擇保留歷史資料的隱藏方式，或在項目未被使用時永久刪除。" : managerModal === "activity" ? "依時間保留帳本的重要異動與操作者。" : "可搜尋、編輯、恢復，以及選擇隱藏或永久刪除。"}</Text>
              </View>
              <Pressable onPress={() => pendingItemAction ? setPendingItemAction(null) : setManagerModal(null)} style={styles.outlineIconButton} accessibilityLabel={pendingItemAction ? "返回管理清單" : "關閉管理視窗"}><MaterialCommunityIcons name={pendingItemAction ? "arrow-left" : "close"} size={18} color={palette.rose} /></Pressable>
            </View>
            {pendingItemAction ? <ScrollView style={styles.managerActionScroll} contentContainerStyle={styles.managerActionPanel} keyboardShouldPersistTaps="handled">
              <View style={styles.managerActionNotice}><MaterialCommunityIcons name="information-outline" size={18} color={palette.rose} /><Text style={styles.managerActionNoticeText}>已有交易、預算或固定收支引用的項目不能永久刪除；隱藏後可隨時由「已隱藏項目」恢復。</Text></View>
              <Pressable onPress={() => resolveItemAction("archive")} style={[styles.confirmPrimary, { backgroundColor: palette.rose }]}><MaterialCommunityIcons name="archive-arrow-down-outline" size={18} color="#FFFFFF" /><Text style={styles.confirmPrimaryText}>隱藏，保留歷史紀錄</Text></Pressable>
              <Pressable onPress={() => resolveItemAction("delete")} style={styles.confirmDanger}><MaterialCommunityIcons name="delete-outline" size={18} color={palette.rose} /><Text style={styles.confirmDangerText}>永久刪除（未被使用時）</Text></Pressable>
              <Pressable onPress={() => setPendingItemAction(null)} style={styles.confirmCancel}><Text style={styles.confirmCancelText}>返回清單</Text></Pressable>
            </ScrollView> : <>
            {managerModal === "category" && <>
              <TextInput value={categoryQuery} onChangeText={setCategoryQuery} placeholder="搜尋分類名稱或圖示" placeholderTextColor={palette.muted} style={styles.input} />
              <Pressable onPress={() => setShowInactiveCategories(value => !value)} style={styles.managerInactiveToggle}><MaterialCommunityIcons name={showInactiveCategories ? "eye-off-outline" : "eye-outline"} size={16} color={palette.rose} /><Text style={styles.managerInactiveToggleText}>{showInactiveCategories ? "隱藏已隱藏項目" : `查看已隱藏項目（${categories.filter(item => item.isActive === 0).length}）`}</Text></Pressable>
              <ScrollView style={styles.managerScroll} keyboardShouldPersistTaps="handled">{visibleCategories.length ? visibleCategories.map(item => <View key={item.id} style={styles.settingsListRow}><View style={styles.settingsListIcon}><Text style={styles.settingsListIconText}>{categoryEmoji(item)}</Text></View><View style={styles.memberPaymentName}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.type === "expense" ? "支出分類" : "收入分類"}{item.isActive === 0 ? " · 已停用" : ""}</Text></View>{isAdmin && <><Pressable onPress={() => startEditCategory(item)} style={styles.outlineIconButton} accessibilityLabel={`編輯分類 ${item.name}`}><MaterialCommunityIcons name="pencil-outline" size={17} color={palette.rose} /></Pressable><Pressable onPress={() => item.isActive === 0 ? restoreCategory(item) : setPendingItemAction({ kind: "category", id: item.id, name: item.name })} style={styles.outlineIconButton} accessibilityLabel={item.isActive === 0 ? `恢復分類 ${item.name}` : `刪除或隱藏分類 ${item.name}`}><MaterialCommunityIcons name={item.isActive === 0 ? "restore" : "delete-outline"} size={18} color={palette.rose} /></Pressable></>}</View>) : <EmptyInline text="找不到符合的分類。" />}</ScrollView>
            </>}
            {managerModal === "payment" && <>
              <TextInput value={paymentQuery} onChangeText={setPaymentQuery} placeholder="搜尋支付方式或圖示" placeholderTextColor={palette.muted} style={styles.input} />
              <Pressable onPress={() => setShowInactivePayments(value => !value)} style={styles.managerInactiveToggle}><MaterialCommunityIcons name={showInactivePayments ? "eye-off-outline" : "eye-outline"} size={16} color={palette.rose} /><Text style={styles.managerInactiveToggleText}>{showInactivePayments ? "隱藏已隱藏項目" : `查看已隱藏項目（${paymentMethods.filter(item => item.isActive === 0).length}）`}</Text></Pressable>
              <ScrollView style={styles.managerScroll} keyboardShouldPersistTaps="handled">{visiblePayments.length ? visiblePayments.map(item => <View key={item.id} style={styles.settingsListRow}><View style={styles.settingsListIcon}><Text style={styles.settingsListIconText}>{paymentEmoji(item)}</Text></View><View style={styles.memberPaymentName}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowSubtitle}>{item.isActive === 0 ? "已停用" : "可用於新增收支"}</Text></View>{isAdmin && <><Pressable onPress={() => startEditPayment(item)} style={styles.outlineIconButton} accessibilityLabel={`編輯支付方式 ${item.name}`}><MaterialCommunityIcons name="pencil-outline" size={17} color={palette.rose} /></Pressable><Pressable onPress={() => item.isActive === 0 ? restorePayment(item) : setPendingItemAction({ kind: "payment", id: item.id, name: item.name })} style={styles.outlineIconButton} accessibilityLabel={item.isActive === 0 ? `恢復支付方式 ${item.name}` : `刪除或隱藏支付方式 ${item.name}`}><MaterialCommunityIcons name={item.isActive === 0 ? "restore" : "delete-outline"} size={18} color={palette.rose} /></Pressable></>}</View>) : <EmptyInline text="找不到符合的支付方式。" />}</ScrollView>
            </>}
            {managerModal === "activity" && <>
              <View style={styles.activityLogSummary}>
                <MaterialCommunityIcons name="history" size={18} color={palette.rose} />
                <Text style={styles.activityLogSummaryText}>顯示 {filteredActivityLogs.length} 筆，最近 50 筆異動</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activityFilterRow} style={styles.activityFilterScroll}>
                {activityFilters.map(filter => <Pressable key={filter.key} onPress={() => setActivityFilter(filter.key)} style={[styles.activityFilterChip, activityFilter === filter.key && { backgroundColor: palette.roseSoft, borderColor: palette.rose }]}><Text style={[styles.activityFilterText, activityFilter === filter.key && { color: palette.rose }]}>{filter.label}</Text></Pressable>)}
              </ScrollView>
              <ScrollView style={styles.managerScroll} contentContainerStyle={styles.activityLogContent}>
                {filteredActivityLogs.length ? filteredActivityLogs.map(log => {
                  const kind = activityKind(log);
                  const icon = kind === "transaction" ? "cash-sync" : kind === "members" ? "account-group-outline" : "cog-outline";
                  const label = kind === "transaction" ? "收支與預算" : kind === "members" ? "成員與邀請" : "帳本設定";
                  return <View key={log.log.id} style={styles.activityLogRow}>
                    <View style={[styles.activityLogIcon, { backgroundColor: palette.roseSoft }]}><MaterialCommunityIcons name={icon as never} size={16} color={palette.rose} /></View>
                    <View style={styles.memberPaymentName}><Text style={styles.rowTitle}>{log.log.summary || `${log.log.action} ${log.log.entityType}`}</Text><Text style={styles.rowSubtitle}>{log.user.name || log.user.email || "成員"} · {new Date(log.log.createdAt).toLocaleString("zh-TW")}</Text><Text style={styles.activityLogTag}>{label}</Text></View>
                  </View>;
                }) : <EmptyInline text="這個篩選條件下尚未有操作紀錄。" />}
              </ScrollView>
            </>}
            </>}
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(editingCategory)} transparent animationType="slide" onRequestClose={() => setEditingCategory(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => setEditingCategory(null)} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollableContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>編輯分類</Text>
            <Text style={styles.modalDescription}>修改名稱或圖示不會影響既有收支紀錄。</Text>
            <TextInput value={draftCategoryName} onChangeText={setDraftCategoryName} placeholder="分類名稱" placeholderTextColor={palette.muted} style={styles.input} />
            <EmojiPicker label="選擇圖示" value={draftCategoryIcon} choices={CATEGORY_EMOJI_CHOICES} onChange={setDraftCategoryIcon} />
            <TextInput value={draftCategoryIcon} onChangeText={setDraftCategoryIcon} placeholder="也可自行輸入表情符號" placeholderTextColor={palette.muted} style={styles.input} />
            <View style={styles.segmentRow}>
              {(["expense", "income"] as const).map(item => (
                <Pressable key={item} onPress={() => setDraftCategoryType(item)} style={[styles.segment, draftCategoryType === item && styles.segmentActive]}>
                  <Text style={[styles.segmentText, draftCategoryType === item && styles.segmentTextActive]}>{item === "expense" ? "支出分類" : "收入分類"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setEditingCategory(null)} style={[styles.confirmCancel, { borderColor: palette.border }]}>
                <Text style={[styles.confirmCancelText, { color: palette.muted }]}>取消</Text>
              </Pressable>
              <Pressable disabled={settingsBusy || !draftCategoryName.trim()} onPress={saveCategory} style={[styles.confirmPrimary, { backgroundColor: palette.rose }, settingsBusy && styles.disabled]}>
                <Text style={styles.confirmPrimaryText}>{settingsBusy ? "儲存中…" : "儲存分類"}</Text>
              </Pressable>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={Boolean(editingPayment)} transparent animationType="slide" onRequestClose={() => setEditingPayment(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismiss} onPress={() => setEditingPayment(null)} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollableContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>編輯支付方式</Text>
            <Text style={styles.modalDescription}>修改名稱或圖示不會影響既有收支紀錄。</Text>
            <TextInput value={draftPaymentName} onChangeText={setDraftPaymentName} placeholder="支付方式名稱" placeholderTextColor={palette.muted} style={styles.input} />
            <EmojiPicker label="選擇圖示" value={draftPaymentIcon} choices={PAYMENT_EMOJI_CHOICES} onChange={setDraftPaymentIcon} />
            <TextInput value={draftPaymentIcon} onChangeText={setDraftPaymentIcon} placeholder="也可自行輸入表情符號" placeholderTextColor={palette.muted} style={styles.input} />
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setEditingPayment(null)} style={[styles.confirmCancel, { borderColor: palette.border }]}>
                <Text style={[styles.confirmCancelText, { color: palette.muted }]}>取消</Text>
              </Pressable>
              <Pressable disabled={settingsBusy || !draftPaymentName.trim()} onPress={savePayment} style={[styles.confirmPrimary, { backgroundColor: palette.rose }, settingsBusy && styles.disabled]}>
                <Text style={styles.confirmPrimaryText}>{settingsBusy ? "儲存中…" : "儲存支付方式"}</Text>
              </Pressable>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const { palette } = useAppearance();
  return (
    <View style={styles.sectionIntro}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}
function EmptyInline({ text }: { text: string }) {
  return (
    <View style={styles.emptyInline}>
      <MaterialCommunityIcons
        name="information-outline"
        size={18}
        color={colors.muted}
      />
      <Text style={styles.emptyInlineText}>{text}</Text>
    </View>
  );
}
function TransactionRow({
  transaction,
  categories,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  categories: Category[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const { palette } = useAppearance();
  const category = categories.find(item => item.id === transaction.categoryId);
  return (
    <View style={styles.transactionRow}>
      <View
        style={[
          styles.transactionIcon,
          { backgroundColor: transaction.type === "income" ? "#E6F0E3" : palette.roseSoft },
        ]}
      >
        <MaterialCommunityIcons
          name={transaction.type === "income" ? "cash-plus" : "receipt-text-outline"}
          size={18}
          color={transaction.type === "income" ? palette.sage : palette.rose}
        />
      </View>
      <View style={styles.memberPaymentName}>
        <Text style={styles.rowTitle}>{categoryEmoji(category)} {category?.name || "未分類"}</Text>
        <Text style={styles.rowSubtitle}>{transaction.note || "共同收支"} · {dateKey(transaction.date)}</Text>
      </View>
      <Text style={[styles.rowAmount, transaction.type === "income" && styles.incomeText]}>
        {transaction.type === "income" ? "+" : "-"}{money(transaction.amount)}
      </Text>
      <View style={styles.transactionActions}>
        <Pressable accessibilityLabel="編輯收支" onPress={() => onEdit(transaction)} style={styles.rowActionButton}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color={palette.muted} />
        </Pressable>
        <Pressable accessibilityLabel="移除收支" onPress={() => onDelete(transaction)} style={styles.rowActionButton}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={palette.rose} />
        </Pressable>
      </View>
    </View>
  );
}

function QuickNav({
  active,
  onSelect,
}: {
  active: DrawerAction;
  onSelect: (action: DrawerAction) => void;
}) {
  const { palette, preferences } = useAppearance();
  const items: Array<{
    key: DrawerAction;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }> = [
    { key: "overview", label: "總覽", icon: "view-dashboard-outline" },
    { key: "calendar", label: "月曆", icon: "calendar-month-outline" },
    { key: "analysis", label: "分析", icon: "chart-line" },
    { key: "planning", label: "規劃", icon: "wallet-outline" },
    { key: "settings", label: "設定", icon: "tune-variant" },
  ];
  return (
    <View style={[styles.quickNav, preferences.navStyle === "minimal" && styles.quickNavMinimal]}>
      {items.map(item => (
        <Pressable
          key={item.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === item.key }}
          accessibilityLabel={`切換至${item.label}`}
          onPress={() => onSelect(item.key)}
          style={({ pressed }) => [
            styles.quickNavItem,
            active === item.key && (preferences.navStyle === "line" ? styles.quickNavItemLineActive : styles.quickNavItemActive),
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name={item.icon}
            size={20}
            color={active === item.key ? palette.rose : palette.muted}
          />
          <Text style={[styles.quickNavLabel, active === item.key && styles.quickNavLabelActive]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function LedgerModal({
  mode,
  ledgerName,
  inviteCode,
  ledgerType,
  error,
  busy,
  setLedgerName,
  setInviteCode,
  setLedgerType,
  onClose,
  onSubmit,
}: {
  mode: "create" | "join" | null;
  ledgerName: string;
  inviteCode: string;
  ledgerType: "couple" | "roommate" | "family";
  error: string;
  busy: boolean;
  setLedgerName: (value: string) => void;
  setInviteCode: (value: string) => void;
  setLedgerType: (value: "couple" | "roommate" | "family") => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { palette } = useAppearance();
  return (
    <Modal
      visible={Boolean(mode)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.select({ ios: "padding", android: "height" })}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
      <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollableContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>
            {mode === "create" ? "建立空白共同帳本" : "加入共同帳本"}
          </Text>
          <Text style={styles.modalDescription}>
            {mode === "create"
              ? "建立全新空白帳本，不含任何預設交易或收支記錄。"
              : "輸入對方分享給你的邀請碼。"}
          </Text>
          {mode === "create" ? (
            <>
              <View style={styles.segmentRow}>
                {(["couple", "roommate", "family"] as const).map(item => (
                  <Pressable
                    key={item}
                    onPress={() => setLedgerType(item)}
                    style={[styles.segment, ledgerType === item && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, ledgerType === item && styles.segmentTextActive]}>
                      {item === "couple" ? "情侶" : item === "roommate" ? "室友" : "家庭"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
              value={ledgerName}
              onChangeText={setLedgerName}
              placeholder="例如：小辰 ＆ 安安"
              placeholderTextColor="#B9A69E"
              style={styles.input}
                autoFocus
              />
            </>
          ) : (
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="輸入邀請碼"
              placeholderTextColor="#B9A69E"
              style={styles.input}
              autoCapitalize="characters"
              autoFocus
            />
          )}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.modalActionBar}>
            <Pressable
              disabled={busy}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {busy
                  ? "處理中…"
                  : mode === "create"
                    ? "建立空白帳本"
                    : "加入帳本"}
              </Text>
              {busy && <ActivityIndicator color="#FFFFFF" />}
            </Pressable>
            <Pressable onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LedgerManageModal({
  visible,
  mode,
  ledger,
  members,
  user,
  error,
  busy,
  onClose,
  onRename,
  onTransfer,
}: {
  visible: boolean;
  mode: "rename" | "transfer";
  ledger: Ledger;
  members: LedgerMember[];
  user: User;
  error: string;
  busy: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onTransfer: (targetUserId: number) => void;
}) {
  const { palette } = useAppearance();
  const [draftName, setDraftName] = useState(ledger.name);
  useEffect(() => {
    if (visible) setDraftName(ledger.name);
  }, [visible, ledger.name]);
  const others = members.filter(item => item.user.id !== user.id);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollableContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{mode === "rename" ? "修改帳本名稱" : "直接轉讓所有權"}</Text>
          <Text style={styles.modalDescription}>
            {mode === "rename" ? "名稱會同步更新到所有成員的帳本列表。" : "轉讓後你仍會留在帳本中，但會成為一般成員。"}
          </Text>
          {mode === "rename" ? (
            <>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="輸入帳本名稱"
                placeholderTextColor={palette.muted}
                style={styles.input}
                maxLength={128}
                autoFocus
              />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable disabled={busy} onPress={() => onRename(draftName)} style={[styles.primaryButton, busy && styles.disabled]}>
                <Text style={styles.primaryButtonText}>{busy ? "儲存中…" : "儲存名稱"}</Text>
                {busy && <ActivityIndicator color="#FFFFFF" />}
              </Pressable>
            </>
          ) : (
            <View style={styles.modalOptionList}>
              {others.length === 0 ? (
                <Text style={styles.emptyText}>目前沒有其他可接任的成員。</Text>
              ) : others.map(item => (
                <Pressable key={item.user.id} disabled={busy} onPress={() => onTransfer(item.user.id)} style={styles.modalOptionRow}>
                  <View style={styles.avatarSmall}>
                    <Text style={styles.avatarSmallText}>{(item.user.name || "成").slice(0, 1)}</Text>
                  </View>
                  <View style={styles.memberPaymentName}>
                    <Text style={styles.rowTitle}>{item.user.name || item.user.email || `成員 ${item.user.id}`}</Text>
                    <Text style={styles.rowSubtitle}>{item.member.role === "admin" ? "管理員" : item.member.role === "viewer" ? "檢視者" : "一般成員"}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={palette.muted} />
                </Pressable>
              ))}
            </View>
          )}
          <Pressable onPress={onClose} style={styles.modalCancel}>
            <Text style={styles.modalCancelText}>取消</Text>
          </Pressable>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TravelPlanModal({
  visible,
  name,
  budget,
  startDate,
  endDate,
  notes,
  error,
  busy,
  setName,
  setBudget,
  setStartDate,
  setEndDate,
  setNotes,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  name: string;
  budget: string;
  startDate: string;
  endDate: string;
  notes: string;
  error: string;
  busy: boolean;
  setName: (value: string) => void;
  setBudget: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setNotes: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { palette } = useAppearance();
  const [datePicker, setDatePicker] = useState<"start" | "end" | null>(null);
  const isDateValue = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const pickerValue = datePicker === "end"
    ? (isDateValue(endDate) ? new Date(`${endDate}T12:00:00`) : new Date())
    : (isDateValue(startDate) ? new Date(`${startDate}T12:00:00`) : new Date());
  const pickerMinimumDate = datePicker === "end" && isDateValue(startDate)
    ? new Date(`${startDate}T12:00:00`)
    : undefined;
  const handleDateChange = (event: DateTimePickerEvent, value?: Date) => {
    const currentField = datePicker;
    setDatePicker(null);
    if (event.type === "dismissed" || !value || !currentField) return;
    const selected = dateKey(value);
    if (currentField === "start") {
      setStartDate(selected);
      if (isDateValue(endDate) && endDate < selected) setEndDate(selected);
    } else {
      setEndDate(selected);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.select({ ios: "padding", android: "height" })}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={[styles.modalCard, styles.modalScrollableContent]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>新增出遊規劃</Text>
          <Text style={styles.modalDescription}>設定旅行、聚會或短期目標預算，不會納入每月預算。</Text>
          <TextInput value={name} onChangeText={setName} placeholder="例如：台南三日遊" placeholderTextColor={palette.muted} style={styles.input} />
          <TextInput value={budget} onChangeText={setBudget} placeholder="預算金額" placeholderTextColor={palette.muted} keyboardType="number-pad" style={styles.input} />
          <Pressable onPress={() => setDatePicker("start")} style={[styles.datePickerTrigger, { marginBottom: 12 }]} accessibilityRole="button" accessibilityLabel="選擇開始日期">
            <View style={styles.datePickerValueRow}>
              <MaterialCommunityIcons name="calendar-month-outline" size={19} color={palette.rose} />
              <Text style={[styles.datePickerText, !startDate && { color: palette.muted }]}>{startDate || "選擇開始日期"}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={19} color={palette.muted} />
          </Pressable>
          <Pressable onPress={() => setDatePicker("end")} style={[styles.datePickerTrigger, { marginBottom: 12 }]} accessibilityRole="button" accessibilityLabel="選擇結束日期">
            <View style={styles.datePickerValueRow}>
              <MaterialCommunityIcons name="calendar-check-outline" size={19} color={palette.rose} />
              <Text style={[styles.datePickerText, !endDate && { color: palette.muted }]}>{endDate || "選擇結束日期"}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={19} color={palette.muted} />
          </Pressable>
          {datePicker && (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === "android" ? "calendar" : "spinner"}
              minimumDate={pickerMinimumDate}
              onChange={handleDateChange}
              accentColor={palette.rose}
            />
          )}
          <TextInput value={notes} onChangeText={setNotes} placeholder="備註（選填）" placeholderTextColor={palette.muted} style={[styles.input, styles.multilineInput]} multiline maxLength={1000} />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable disabled={busy} onPress={onSubmit} style={[styles.primaryButton, busy && styles.disabled]}>
            <Text style={styles.primaryButtonText}>{busy ? "建立中…" : "建立出遊規劃"}</Text>
            {busy && <ActivityIndicator color="#FFFFFF" />}
          </Pressable>
          <Pressable onPress={onClose} style={styles.modalCancel}>
            <Text style={styles.modalCancelText}>取消</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ConfirmModal({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  const { palette } = useAppearance();
  if (!request) return null;
  const run = (callback: () => void | Promise<void>) => {
    onClose();
    void callback();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.confirmOverlay}>
        <Pressable style={styles.confirmDismiss} onPress={onClose} />
        <View style={[styles.confirmCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ScrollView
            contentContainerStyle={styles.confirmContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={[styles.confirmIcon, { backgroundColor: request.destructive ? palette.roseSoft : palette.roseSoft }]}>
            <MaterialCommunityIcons
              name={request.destructive ? "alert-outline" : "help-circle-outline"}
              size={24}
              color={palette.rose}
            />
          </View>
          <Text style={styles.confirmTitle}>{request.title}</Text>
          <Text style={styles.confirmMessage}>{request.message}</Text>
          {request.options?.length ? (
            <View style={styles.confirmOptionList}>
              {request.options.map((option, index) => (
                <Pressable
                  key={`${option.label}-${index}`}
                  onPress={() => run(option.onPress)}
                  style={({ pressed }) => [
                    styles.confirmOption,
                    { borderColor: option.destructive ? palette.rose : palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={(option.icon || (option.destructive ? "delete-outline" : "account-switch-outline")) as never}
                    size={19}
                    color={option.destructive ? palette.rose : palette.ink}
                  />
                  <Text style={[styles.confirmOptionText, { color: option.destructive ? palette.rose : palette.ink }]}>
                    {option.label}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={19} color={palette.muted} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.confirmActions}>
              <Pressable onPress={onClose} style={[styles.confirmCancel, { borderColor: palette.border }]}>
                <Text style={[styles.confirmCancelText, { color: palette.muted }]}>{request.cancelText || "取消"}</Text>
              </Pressable>
              <Pressable
                onPress={() => run(request.onConfirm || (() => undefined))}
                style={({ pressed }) => [
                  styles.confirmPrimary,
                  { backgroundColor: request.destructive ? palette.rose : palette.burgundy },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.confirmPrimaryText}>{request.confirmText || "確定"}</Text>
              </Pressable>
            </View>
          )}
          {!!request.options?.length && (
            <Pressable onPress={onClose} style={styles.confirmCancelLink}>
              <Text style={[styles.confirmCancelText, { color: palette.muted }]}>{request.cancelText || "取消"}</Text>
            </Pressable>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AccountDeletionModal({
  visible,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (password: string) => void | Promise<void>;
}) {
  const { palette } = useAppearance();
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (!visible) setPassword("");
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.confirmOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.confirmDismiss} onPress={busy ? undefined : onClose} />
        <View style={[styles.confirmCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ScrollView contentContainerStyle={styles.confirmContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.confirmIcon, { backgroundColor: palette.roseSoft }]}>
              <MaterialCommunityIcons name="alert-outline" size={24} color={palette.rose} />
            </View>
            <Text style={styles.confirmTitle}>永久刪除帳號</Text>
            <Text style={styles.confirmMessage}>這個動作無法復原。你會退出所有帳本；若你是有其他成員帳本的持有者，所有權會轉給最早加入的成員；若沒有其他成員，該帳本資料會一併刪除。</Text>
            <Text style={[styles.personalizationLabel, { color: palette.rose }]}>輸入目前密碼以確認</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="目前密碼"
              placeholderTextColor={palette.muted}
              style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.ink }]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              editable={!busy}
              onSubmitEditing={() => void onSubmit(password)}
              returnKeyType="done"
            />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.confirmActions}>
              <Pressable disabled={busy} onPress={onClose} style={[styles.confirmCancel, { borderColor: palette.border }, busy && styles.disabled]}>
                <Text style={[styles.confirmCancelText, { color: palette.muted }]}>取消</Text>
              </Pressable>
              <Pressable
                disabled={busy || !password}
                onPress={() => void onSubmit(password)}
                style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: palette.rose }, (pressed || busy || !password) && styles.pressed, (busy || !password) && styles.disabled]}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmPrimaryText}>永久刪除</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TransactionModal({
  visible,
  editingTransaction,
  user,
  members,
  categories,
  paymentMethods,
  error,
  onClose,
  onSetupPayment,
  onSubmit,
}: {
  visible: boolean;
  editingTransaction: Transaction | null;
  user: User;
  members: LedgerMember[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  error: string;
  onClose: () => void;
  onSetupPayment: () => void;
  onSubmit: (input: {
    payerId: number;
    amount: number;
    type: "expense" | "income";
    categoryId: number;
    paymentMethodId: number;
    date: Date;
    note?: string;
    splitType: "equal" | "custom" | "amount" | "none";
    splits: { userId: number; shareAmount: number }[];
  }) => void;
}) {
  const { palette } = useAppearance();
  const [amountText, setAmountText] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [payerId, setPayerId] = useState(String(user.id));
  const [dateText, setDateText] = useState(dateKey(new Date()));
  const [note, setNote] = useState("");
  const [splitType, setSplitType] = useState<"equal" | "custom" | "amount" | "none">(
    "equal"
  );
  const [splitValues, setSplitValues] = useState<Record<number, string>>({});
  const [categorySearch, setCategorySearch] = useState("");
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => currentMonth());
  const [scanning, setScanning] = useState(false);
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      const tx = editingTransaction;
      setAmountText(tx ? String(tx.amount) : "");
      setType(tx?.type === "income" ? "income" : "expense");
      setCategoryId(tx ? String(tx.categoryId) : "");
      setPaymentId(tx ? String(tx.paymentMethodId) : "");
      setPayerId(tx ? String(tx.payerId) : String(user.id));
      const initialDate = tx ? dateKey(tx.date) : dateKey(new Date());
      setDateText(initialDate);
      setCalendarMonth(initialDate.slice(0, 7));
      setNote(tx?.note || "");
      setSplitType(tx?.splitType || "equal");
      setSplitValues({});
      setCategorySearch("");
      setDatePickerVisible(false);
      setLocalError("");
    }
  }, [visible, user.id, editingTransaction?.id]);
  const availableCategories = categories.filter(item => item.type === type && item.isActive !== 0);
  const filteredCategories = availableCategories.filter(item =>
    `${item.name} ${item.icon}`.toLowerCase().includes(categorySearch.trim().toLowerCase())
  );
  const activePaymentMethods = paymentMethods.filter(item => item.isActive !== 0);
  const selectedCategories = categoryId || String(availableCategories[0]?.id || "");
  const selectedPayment = paymentId || String(activePaymentMethods[0]?.id || "");
  const scanReceiptAsset = async (asset: ImagePicker.ImagePickerAsset | undefined) => {
    if (!asset?.base64) {
      setLocalError("無法讀取發票影像，請重新拍攝或選圖。");
      return;
    }
    setScanning(true);
    setLocalError("");
    try {
      const imageDataUrl = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
      const result = await api.ledger.scanReceipt.mutate({ imageDataUrl });
      if (result.amount) setAmountText(String(result.amount));
      if (result.date && /^\d{4}-\d{2}-\d{2}$/.test(result.date)) {
        setDateText(result.date);
        setCalendarMonth(result.date.slice(0, 7));
      }
      if (result.note) setNote(result.note);
      if (!result.amount && !result.date && !result.note) setLocalError("發票資訊不清楚，請手動確認欄位。");
    } catch (scanError) {
      setLocalError(scanError instanceof Error ? scanError.message : "發票辨識失敗，請改用手動輸入。");
    } finally {
      setScanning(false);
    }
  };
  const pickReceipt = async (source: "camera" | "library") => {
    try {
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.68, allowsEditing: false, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.68, allowsEditing: false, mediaTypes: ["images"], selectionLimit: 1 });
      if (!result.canceled) await scanReceiptAsset(result.assets[0]);
    } catch (pickerError) {
      setLocalError(pickerError instanceof Error ? pickerError.message : "無法開啟影像選取功能。");
    }
  };
  const [calendarYear, calendarMonthNumber] = calendarMonth.split("-").map(Number);
  const calendarFirstDay = new Date(calendarYear, calendarMonthNumber - 1, 1).getDay();
  const calendarDays = new Date(calendarYear, calendarMonthNumber, 0).getDate();
  const calendarCells = Array.from({ length: calendarFirstDay + calendarDays }, (_, index) =>
    index < calendarFirstDay ? null : index - calendarFirstDay + 1
  );
  const submit = () => {
    const amount = Number(amountText);
    if (!Number.isInteger(amount) || amount <= 0) {
      setLocalError("請輸入正整數金額。");
      return;
    }
    if (!selectedCategories || !selectedPayment) {
      setLocalError("請先到設定建立分類與支付方式。");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      setLocalError("日期格式請使用 YYYY-MM-DD。");
      return;
    }
    let splits: { userId: number; shareAmount: number }[] = [];
    if (type === "expense") {
      if (splitType === "equal") {
        const share = Math.floor(amount / Math.max(1, members.length));
        const remainder = amount - share * Math.max(1, members.length);
        splits = members.map((member, index) => ({
          userId: member.user.id,
          shareAmount: share + (index === 0 ? remainder : 0),
        }));
      } else if (splitType === "custom") {
        const ratios = members.map(member => ({
          userId: member.user.id,
          ratio: Number(splitValues[member.user.id] || 0),
        }));
        if (
          ratios.some(item => !Number.isFinite(item.ratio) || item.ratio < 0) ||
          Math.round(ratios.reduce((sum, item) => sum + item.ratio, 0) * 100) / 100 !== 100
        ) {
          setLocalError("自訂比例總和必須剛好是 100%。");
          return;
        }
        const rawShares = ratios.map(item => ({
          userId: item.userId,
          shareAmount: Math.floor((amount * item.ratio) / 100),
        }));
        const remainder = amount - rawShares.reduce((sum, item) => sum + item.shareAmount, 0);
        splits = rawShares.map((item, index) => ({
          userId: item.userId,
          shareAmount: item.shareAmount + (index === 0 ? remainder : 0),
        }));
      } else if (splitType === "amount") {
        splits = members
          .map(member => ({
            userId: member.user.id,
            shareAmount: Number(splitValues[member.user.id] || 0),
          }))
          .filter(item => item.shareAmount > 0);
        if (splits.reduce((sum, item) => sum + item.shareAmount, 0) !== amount) {
          setLocalError("直接分攤金額必須剛好等於總金額。");
          return;
        }
      }
    }
    onSubmit({
      payerId: Number(payerId),
      amount,
      type,
      categoryId: Number(selectedCategories),
      paymentMethodId: Number(selectedPayment),
      date: new Date(`${dateText}T12:00:00`),
      note: note.trim() || undefined,
      splitType,
      splits,
    });
  };
  const changeCalendarMonth = (offset: number) => {
    const next = new Date(calendarYear, calendarMonthNumber - 1 + offset, 1);
    setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.select({ ios: "padding", android: "height" })}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
      <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.transactionModalScrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator
        >
          <View style={[styles.modalCard, styles.transactionModalCard]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{editingTransaction ? "編輯收支記錄" : "新增收支記錄"}</Text>
            <Text style={styles.modalDescription}>
              金額、分類、日期、付款人、支付方式、備註與分攤方式都會保存。
            </Text>
            <View style={styles.receiptActions}>
              <Pressable disabled={scanning} onPress={() => pickReceipt("camera")} style={styles.receiptButton}>
                <MaterialCommunityIcons name="camera-outline" size={17} color={palette.rose} />
                <Text style={styles.receiptButtonText} numberOfLines={1}>{scanning ? "辨識中…" : "拍照掃描發票"}</Text>
              </Pressable>
              <Pressable disabled={scanning} onPress={() => pickReceipt("library")} style={styles.receiptButton}>
                <MaterialCommunityIcons name="image-multiple-outline" size={17} color={palette.rose} />
                <Text style={styles.receiptButtonText} numberOfLines={1}>從相簿選圖</Text>
              </Pressable>
            </View>
            {paymentMethods.length === 0 && (
              <View style={styles.setupNotice}>
                <MaterialCommunityIcons
                  name="credit-card-outline"
                  size={19}
                  color={palette.rose}
                />
                <View style={styles.setupNoticeCopy}>
                  <Text style={styles.setupNoticeTitle}>尚未建立支付方式</Text>
                  <Text style={styles.setupNoticeBody}>
                    先新增現金、信用卡或其他方式，才能儲存收支。
                  </Text>
                </View>
                <Pressable onPress={onSetupPayment} style={styles.setupNoticeButton}>
                  <Text style={styles.setupNoticeButtonText}>去設定</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.segmentRow}>
              {(["expense", "income"] as const).map(item => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setType(item);
                    setCategoryId("");
                  }}
                  style={[
                    styles.segment,
                    type === item && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      type === item && styles.segmentTextActive,
                    ]}
                  >
                    {item === "expense" ? "支出" : "收入"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field label="金額">
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                placeholder="例如 680"
                keyboardType="numeric"
                placeholderTextColor="#B9A69E"
                style={styles.input}
              />
            </Field>
            <Field label="分類">
              <TextInput
                value={categorySearch}
                onChangeText={setCategorySearch}
                placeholder="搜尋分類名稱"
                placeholderTextColor="#B9A69E"
                style={styles.input}
              />
              <OptionScroller
                items={filteredCategories.map(item => ({ id: item.id, label: `${categoryEmoji(item)} ${item.name}` }))}
                value={Number(selectedCategories)}
                onChange={value => setCategoryId(String(value))}
              />
            </Field>
            <Field label="付款人">
              <OptionScroller
                items={members.map(item => ({
                  id: item.user.id,
                  label:
                    item.user.id === user.id
                      ? "你"
                      : item.user.name || item.user.email || "成員",
                }))}
                value={Number(payerId)}
                onChange={value => setPayerId(String(value))}
              />
            </Field>
            <Field label="支付方式">
              <OptionScroller
                items={activePaymentMethods.map(item => ({ id: item.id, label: `${paymentEmoji(item)} ${item.name}` }))}
                value={Number(selectedPayment)}
                onChange={value => setPaymentId(String(value))}
              />
            </Field>
            <Field label="日期">
              <Pressable onPress={() => setDatePickerVisible(true)} style={styles.datePickerTrigger}>
                <Text style={styles.datePickerText}>{dateText}</Text>
                <MaterialCommunityIcons name="calendar-month-outline" size={19} color={palette.rose} />
              </Pressable>
            </Field>
            <Field label="分攤方式">
              {type === "income" ? (
                <Text style={styles.rowSubtitle}>收入不需要分攤。</Text>
              ) : (
                <>
                  <View style={styles.segmentRow}>
                    {(["equal", "custom", "amount", "none"] as const).map(item => (
                      <Pressable
                        key={item}
                        onPress={() => setSplitType(item)}
                        style={[
                          styles.miniSegment,
                          splitType === item && styles.miniSegmentActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniSegmentText,
                            splitType === item && styles.miniSegmentTextActive,
                          ]}
                        >
                          {item === "equal"
                            ? "平均"
                            : item === "custom"
                              ? "自訂比例"
                              : item === "amount" ? "直接金額" : "無分攤"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {splitType !== "equal" && splitType !== "none" &&
                    members.map(member => (
                      <View key={member.user.id} style={styles.splitInputRow}>
                        <Text style={styles.splitMemberName} numberOfLines={1}>
                          {member.user.name || member.user.email || "成員"}
                        </Text>
                        <TextInput
                          value={splitValues[member.user.id] || ""}
                          onChangeText={value =>
                            setSplitValues(previous => ({
                              ...previous,
                              [member.user.id]: value,
                            }))
                          }
                          keyboardType="numeric"
                          placeholder={splitType === "custom" ? "比例 %" : "分攤金額"}
                          placeholderTextColor="#B9A69E"
                          style={styles.splitInput}
                        />
                      </View>
                    ))}
                </>
              )}
            </Field>
            <Field label="備註">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="例如：週末晚餐"
                placeholderTextColor="#B9A69E"
                style={[styles.input, styles.textarea]}
                multiline
              />
            </Field>
            {!!localError && <Text style={styles.errorText}>{localError}</Text>}
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>儲存這筆記錄</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>取消</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={datePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
      <View style={styles.calendarOverlay}>
        <View style={styles.dateCalendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable onPress={() => changeCalendarMonth(-1)} style={styles.calendarArrow}><MaterialCommunityIcons name="chevron-left" size={22} color={palette.ink} /></Pressable>
            <Text style={styles.calendarMonthTitle}>{calendarMonth.replace("-", " / ")}</Text>
            <Pressable onPress={() => changeCalendarMonth(1)} style={styles.calendarArrow}><MaterialCommunityIcons name="chevron-right" size={22} color={palette.ink} /></Pressable>
          </View>
          <View style={styles.calendarWeekRow}>{["日", "一", "二", "三", "四", "五", "六"].map(day => <Text key={day} style={styles.calendarWeekday}>{day}</Text>)}</View>
          <View style={styles.calendarGrid}>
            {calendarCells.map((day, index) => day ? (
              <Pressable key={`${calendarMonth}-${day}`} onPress={() => { const chosen = `${calendarMonth}-${String(day).padStart(2, "0")}`; setDateText(chosen); setDatePickerVisible(false); }} style={[styles.calendarDayCell, dateText === `${calendarMonth}-${String(day).padStart(2, "0")}` && styles.calendarDayActive]}>
                <Text style={[styles.calendarDayText, dateText === `${calendarMonth}-${String(day).padStart(2, "0")}` && styles.calendarDayTextActive]}>{day}</Text>
              </Pressable>
            ) : <View key={`empty-${index}`} style={styles.calendarDayCell} />)}
          </View>
          <Pressable onPress={() => setDatePickerVisible(false)} style={styles.modalCancel}><Text style={styles.modalCancelText}>關閉</Text></Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}
function OptionScroller({
  items,
  value,
  onChange,
}: {
  items: { id: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  const { palette } = useAppearance();
  return items.length === 0 ? (
    <Text style={styles.rowSubtitle}>尚未建立選項，請先到設定新增。</Text>
  ) : (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.optionScroller}
    >
      {items.map(item => (
        <Pressable
          key={item.id}
          onPress={() => onChange(item.id)}
          style={[
            styles.optionChip,
            value === item.id && styles.optionChipActive,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.optionChipText,
              value === item.id && styles.optionChipTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function EmojiPicker({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  onChange: (emoji: string) => void;
}) {
  return (
    <View style={styles.emojiPicker}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiPickerRow}>
        {choices.map(emoji => (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={`選擇圖示 ${emoji}`}
            onPress={() => onChange(emoji)}
            style={({ pressed }) => [
              styles.emojiChoice,
              value === emoji && styles.emojiChoiceActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.emojiChoiceText}>{emoji}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const MAX_BUDGET_AMOUNT = 100_000_000;

function BudgetModal({
  visible,
  categories,
  currentMonth: month,
  ledgerId,
  editingBudget,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  categories: Category[];
  currentMonth: string;
  ledgerId: number;
  editingBudget: Budget | null;
  onClose: () => void;
  onSubmit: (input: {
    ledgerId: number;
    categoryId: number;
    amount: number;
    month: string;
  }) => void;
}) {
  const { palette } = useAppearance();
  const [categoryId, setCategoryId] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      setCategoryId(editingBudget?.categoryId || 0);
      setAmount(editingBudget ? String(editingBudget.amount) : "");
      setLocalError("");
    }
  }, [visible, editingBudget]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.select({ ios: "padding", android: "height" })}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollableContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{editingBudget ? "編輯分類預算" : "設定預算"}</Text>
          <Text style={styles.modalDescription}>
            {editingBudget ? "調整此分類本月的預算金額；既有收支資料不會變更。" : "設定本月總預算或指定分類預算；超支時會顯示警示。"}
          </Text>
          {editingBudget ? (
            <Field label="預算分類">
              <Text style={styles.input}>{editingBudget.categoryId === 0 ? "總預算" : `${categories.find(item => item.id === editingBudget.categoryId)?.icon || "◌"} ${categories.find(item => item.id === editingBudget.categoryId)?.name || "分類"}`}</Text>
            </Field>
          ) : (
            <OptionScroller
              items={[
                { id: 0, label: "總預算" },
                ...categories
                  .filter(item => item.type === "expense")
                  .map(item => ({
                    id: item.id,
                    label: `${item.icon} ${item.name}`,
                  })),
              ]}
              value={categoryId}
              onChange={value => setCategoryId(value)}
            />
          )}
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="預算金額（最高 NT$ 100,000,000）"
            placeholderTextColor={palette.muted}
            maxLength={9}
            style={styles.input}
          />
          {!!localError && <Text style={styles.errorText}>{localError}</Text>}
          <View style={styles.modalActionBar}>
            <Pressable
              onPress={() => {
                const value = Number(amount);
                if (!Number.isInteger(value) || value <= 0) {
                  setLocalError("請輸入正整數預算。");
                  return;
                }
                if (value > MAX_BUDGET_AMOUNT) {
                  setLocalError("預算上限為 NT$ 100,000,000，請分開規劃較大的目標。");
                  return;
                }
                onSubmit({
                  ledgerId,
                  categoryId: Number(categoryId) || 0,
                  amount: value,
                  month,
                });
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>{editingBudget ? "更新預算" : "儲存預算"}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RecurringModal({
  visible,
  categories,
  paymentMethods,
  ledgerId,
  editingRecurring,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  ledgerId: number;
  editingRecurring: Recurring | null;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    amount: number;
    type: "expense" | "income";
    categoryId: number;
    paymentMethodId: number;
    frequency: "weekly" | "monthly" | "yearly";
    dayOfMonth: number;
  }) => void;
}) {
  const { palette } = useAppearance();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">(
    "monthly"
  );
  const [day, setDay] = useState("1");
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      setTitle(editingRecurring?.title || "");
      setAmount(editingRecurring ? String(editingRecurring.amount) : "");
      setType(editingRecurring?.type || "expense");
      setCategoryId(editingRecurring ? String(editingRecurring.categoryId) : "");
      setPaymentId(editingRecurring ? String(editingRecurring.paymentMethodId) : "");
      setFrequency(editingRecurring?.frequency || "monthly");
      setDay(editingRecurring ? String(editingRecurring.dayOfMonth) : "1");
      setLocalError("");
    }
  }, [visible, editingRecurring]);
  const filtered = categories.filter(item => item.type === type && item.isActive !== 0);
  const availablePayments = paymentMethods.filter(item => item.isActive !== 0);
  const selectedCategory = categoryId || String(filtered[0]?.id || "");
  const selectedPayment = paymentId || String(availablePayments[0]?.id || "");
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.select({ ios: "padding", android: "height" })}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollableContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingRecurring ? "編輯固定收支" : "新增固定收支"}</Text>
            <Text style={styles.modalDescription}>
              {editingRecurring ? "更新後將套用至未來自動建立的記錄，既有收支不會變更。" : "每次開啟帳本時會以固定鍵檢查並補入當期記錄，不會重複建立。"}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="項目名稱，例如房租／薪資"
              placeholderTextColor="#B9A69E"
              style={styles.input}
            />
            <View style={styles.segmentRow}>
              {(["expense", "income"] as const).map(item => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setType(item);
                    setCategoryId("");
                  }}
                  style={[
                    styles.segment,
                    type === item && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      type === item && styles.segmentTextActive,
                    ]}
                  >
                    {item === "expense" ? "固定支出" : "固定收入"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="金額"
              placeholderTextColor="#B9A69E"
              style={styles.input}
            />
            <Field label="分類">
              <OptionScroller
                items={filtered.map(item => ({
                  id: item.id,
                  label: `${item.icon} ${item.name}`,
                }))}
                value={Number(selectedCategory)}
                onChange={value => setCategoryId(String(value))}
              />
              {filtered.length === 0 && <Text style={styles.errorText}>請先在帳本設定新增或恢復一個可用的{type === "expense" ? "支出" : "收入"}分類。</Text>}
            </Field>
            <Field label="支付方式">
              <OptionScroller
                items={availablePayments.map(item => ({
                  id: item.id,
                  label: `${item.icon} ${item.name}`,
                }))}
                value={Number(selectedPayment)}
                onChange={value => setPaymentId(String(value))}
              />
              {availablePayments.length === 0 && <Text style={styles.errorText}>請先在帳本設定新增或恢復一個可用的支付方式。</Text>}
            </Field>
            <Field label="頻率">
              <View style={styles.segmentRow}>
                {(["weekly", "monthly", "yearly"] as const).map(item => (
                  <Pressable
                    key={item}
                    onPress={() => setFrequency(item)}
                    style={[
                      styles.miniSegment,
                      frequency === item && styles.miniSegmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.miniSegmentText,
                        frequency === item && styles.miniSegmentTextActive,
                      ]}
                    >
                      {item === "weekly"
                        ? "每週"
                        : item === "monthly"
                          ? "每月"
                          : "每年"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <TextInput
              value={day}
              onChangeText={setDay}
              keyboardType="numeric"
              placeholder="每月幾號（1-31）"
              placeholderTextColor="#B9A69E"
              style={styles.input}
            />
            {!!localError && <Text style={styles.errorText}>{localError}</Text>}
            <View style={styles.modalActionBar}>
              <Pressable
                onPress={() => {
                  const parsedAmount = Number(amount);
                  const parsedDay = Number(day);
                  if (
                    !title.trim() ||
                    !Number.isInteger(parsedAmount) ||
                    parsedAmount <= 0 ||
                    filtered.length === 0 ||
                    availablePayments.length === 0 ||
                    !selectedCategory ||
                    !selectedPayment ||
                    parsedDay < 1 ||
                    parsedDay > 31
                  ) {
                    setLocalError("請完整填寫名稱、金額、可用的分類、支付方式與日期。");
                    return;
                  }
                  onSubmit({
                    title: title.trim(),
                    amount: parsedAmount,
                    type,
                    categoryId: Number(selectedCategory),
                    paymentMethodId: Number(selectedPayment),
                    frequency,
                    dayOfMonth: parsedDay,
                  });
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>{editingRecurring ? "更新固定收支" : "儲存固定收支"}</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>取消</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SettingsModal({
  visible,
  mode,
  ledgerId,
  categories,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: "category" | "payment";
  ledgerId: number;
  categories: Category[];
  onClose: () => void;
  onSubmit: (input: {
    parentCategoryId: number;
    name: string;
    type: "expense" | "income";
    icon: string;
  }) => void;
}) {
  const { palette } = useAppearance();
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [parent, setParent] = useState("0");
  const [icon, setIcon] = useState(mode === "category" ? "🏷️" : "💳");
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      setName("");
      setType("expense");
      setParent("0");
      setIcon(mode === "category" ? "🏷️" : "💳");
      setLocalError("");
    }
  }, [visible, mode]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.select({ ios: "padding", android: "height" })}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
      <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollableContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>
            {mode === "category" ? "新增分類／子分類" : "新增支付方式"}
          </Text>
          <Text style={styles.modalDescription}>
            {mode === "category"
              ? "可建立飲食、交通等主分類，也可選擇父分類建立子分類。"
              : "建立你的現金、信用卡或其他支付方式。"}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="名稱"
            placeholderTextColor="#B9A69E"
            style={styles.input}
          />
          <EmojiPicker label="選擇圖示" value={icon} choices={mode === "category" ? CATEGORY_EMOJI_CHOICES : PAYMENT_EMOJI_CHOICES} onChange={setIcon} />
          <TextInput
            value={icon}
            onChangeText={setIcon}
            placeholder="也可自行輸入表情符號"
            placeholderTextColor="#B9A69E"
            style={styles.input}
          />
          {mode === "category" && (
            <>
              <View style={styles.segmentRow}>
                {(["expense", "income"] as const).map(item => (
                  <Pressable
                    key={item}
                    onPress={() => setType(item)}
                    style={[
                      styles.segment,
                      type === item && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        type === item && styles.segmentTextActive,
                      ]}
                    >
                      {item === "expense" ? "支出分類" : "收入分類"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <OptionScroller
                items={[
                  { id: 0, label: "主分類" },
                  ...categories
                    .filter(item => item.type === type)
                    .map(item => ({
                      id: item.id,
                      label: `${categoryEmoji(item)} ${item.name}`,
                    })),
                ]}
                value={Number(parent)}
                onChange={value => setParent(String(value))}
              />
            </>
          )}
          {!!localError && <Text style={styles.errorText}>{localError}</Text>}
          <Pressable
            onPress={() => {
              if (!name.trim()) {
                setLocalError("請輸入名稱。");
                return;
              }
              onSubmit({
                parentCategoryId: Number(parent),
                name: name.trim(),
                type,
                icon: mode === "category" ? categoryEmoji({ name, icon }) : paymentEmoji({ name, icon }),
              });
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>儲存</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.modalCancel}>
            <Text style={styles.modalCancelText}>取消</Text>
          </Pressable>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (palette: typeof colors, preferences: AppearancePreferences = appearanceDefaults) => {
  const cardRadius = preferences.cardStyle === "outlined" ? 14 : preferences.cardStyle === "flat" ? 10 : 20;
  const cardBorderWidth = preferences.cardStyle === "flat" ? 0 : 1;
  return StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: palette.background },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
  },
  loadingText: { marginTop: 12, color: palette.muted, fontSize: 13 },
  loginContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 42,
    paddingBottom: 30,
  },
  brandMark: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: palette.roseSoft,
  },
  brandTitle: {
    marginTop: 13,
    color: palette.ink,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 1,
  },
  brandSubtitle: {
    marginTop: 2,
    color: "#B69E94",
    fontSize: 9,
    letterSpacing: 2.4,
  },
  loginHeading: {
    marginTop: 52,
    color: palette.ink,
    fontSize: 31,
    fontWeight: "700",
    lineHeight: 42,
  },
  loginDescription: {
    marginTop: 14,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  formCard: {
    marginTop: 34,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    backgroundColor: palette.surface,
  },
  formTitle: { color: palette.ink, fontSize: 18, fontWeight: "700" },
  formBody: { marginTop: 8, color: palette.muted, fontSize: 13, lineHeight: 21 },
  privacyText: {
    marginTop: 22,
    color: "#AE9C94",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },
  pageContent: {
    padding: 18,
    paddingBottom: 60,
  },
  ledgerSelector: {
    marginBottom: 14,
  },
  selectorLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 7,
    textTransform: "uppercase",
  },
  ledgerChip: {
    minHeight: 36,
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    marginRight: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  ledgerChipActive: {
    borderColor: palette.roseSoft,
    backgroundColor: palette.roseSoft,
  },
  ledgerChipText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  ledgerChipTextActive: {
    color: palette.rose,
    fontWeight: "800",
  },
  sectionIntro: { marginBottom: 20 },
  eyebrow: {
    color: palette.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  sectionTitle: {
    marginTop: 7,
    color: palette.ink,
    fontSize: 27,
    fontWeight: "700",
  },
  sectionBody: {
    marginTop: 8,
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  globalError: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    color: "#B4575D",
    backgroundColor: "#FBE9E7",
    fontSize: 12,
  },
  headerSafe: { backgroundColor: palette.surface },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  appHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  headerTitleWrap: { flex: 1, marginLeft: 8 },
  headerTitle: { color: palette.ink, fontSize: 21, fontWeight: "700" },
  headerCaption: { marginTop: 2, color: palette.muted, fontSize: 11 },
  headerAddButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: palette.rose,
  },
  headerSpacer: { width: 44 },
  headerBackButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#F5EFEC",
  },
  quickNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  quickNavMinimal: {
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 0,
  },
  quickNavItem: {
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 4,
    borderRadius: 13,
  },
  quickNavItemActive: { backgroundColor: palette.roseSoft },
  quickNavItemLineActive: { backgroundColor: "transparent", borderTopWidth: 2, borderTopColor: palette.rose, borderRadius: 0, paddingTop: 6 },
  quickNavLabel: { color: palette.muted, fontSize: 10, fontWeight: "600" },
  quickNavLabelActive: { color: palette.rose, fontWeight: "800" },
  ledgerHomeContent: { flexGrow: 1, padding: 18, paddingBottom: 40 },
  profileContent: { flexGrow: 1, padding: 18, paddingBottom: 42 },
  ledgerHomeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 19,
    backgroundColor: palette.surface,
  },
  ledgerHomeIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: palette.roseSoft,
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: palette.roseSoft,
    borderRadius: 16,
    backgroundColor: palette.surface,
  },
  secondaryActionButtonText: { color: palette.rose, fontSize: 14, fontWeight: "700" },
  inviteCodeCopy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: palette.roseSoft,
  },
  inviteCopyHint: { flexDirection: "row", alignItems: "center", gap: 5 },
  inviteCopyHintText: { color: palette.rose, fontSize: 11, fontWeight: "700" },
  personalizationHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  profileSettingsShell: { gap: 14 },
  settingsGroupCard: {
    padding: 18,
    borderWidth: cardBorderWidth,
    borderColor: palette.border,
    borderRadius: cardRadius,
    backgroundColor: palette.surface,
    ...(preferences.cardStyle === "soft" ? { shadowColor: palette.ink, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 } : {}),
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  preferenceCopy: { flex: 1 },
  personalizationLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  appearanceGrid: { gap: 8 },
  appearanceStyleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    backgroundColor: palette.surface,
  },
  appearanceStyleCopy: { flex: 1, gap: 2 },
  appearanceStyleHint: { color: palette.muted, fontSize: 11 },
  appearanceOption: {
    minWidth: 72,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  appearanceOptionActive: {
    borderColor: palette.rose,
    backgroundColor: palette.roseSoft,
  },
  appearanceOptionText: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  fontPreview: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  themeDot: { width: 12, height: 12, borderRadius: 6 },
  emptyContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  emptyIllustration: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 34,
    backgroundColor: palette.roseSoft,
  },
  emptyTitle: {
    marginTop: 25,
    color: palette.ink,
    fontSize: 28,
    fontWeight: "700",
  },
  emptyDescription: {
    maxWidth: 330,
    marginTop: 12,
    color: palette.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
  },
  card: {
    marginBottom: 14,
    padding: 18,
    borderWidth: cardBorderWidth,
    borderColor: palette.border,
    borderRadius: cardRadius,
    backgroundColor: palette.surface,
    ...(preferences.cardStyle === "soft" ? { shadowColor: palette.ink, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 } : {}),
  },
  heroCard: {
    marginBottom: 14,
    padding: 24,
    borderRadius: 25,
    backgroundColor: palette.burgundy,
  },
  heroEyebrow: { color: "#E8C9CA", fontSize: 12, letterSpacing: 1 },
  heroTitle: {
    marginTop: 12,
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "700",
  },
  heroBody: { marginTop: 10, color: "#E7D6D1", fontSize: 14, lineHeight: 22 },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 24,
  },
  heroFooterText: { flex: 1, color: "#F8E9E5", fontSize: 12 },
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 14,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 16,
    backgroundColor: palette.rose,
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  inviteBadge: {
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: palette.roseSoft,
  },
  inviteBadgeLabel: { color: palette.muted, fontSize: 10 },
  inviteBadgeValue: {
    marginTop: 3,
    color: palette.rose,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  statRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1,
    padding: 15,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 19,
    backgroundColor: palette.surface,
  },
  statIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
    borderRadius: 11,
    backgroundColor: palette.roseSoft,
  },
  statLabel: { color: palette.muted, fontSize: 12 },
  statValue: {
    marginTop: 7,
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 18,
    borderRadius: 19,
    backgroundColor: palette.roseSoft,
  },
  balanceLabel: { color: palette.muted, fontSize: 12 },
  balanceValue: {
    marginTop: 7,
    color: palette.ink,
    fontSize: 23,
    fontWeight: "700",
  },
  trendText: {
    maxWidth: 130,
    color: palette.rose,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "right",
  },
  donutLayout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  donutWrap: {
    width: 172,
    height: 172,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 105,
  },
  donutCenterLabel: { color: palette.muted, fontSize: 11 },
  donutCenterValue: { marginTop: 4, color: palette.ink, fontSize: 13, fontWeight: "800" },
  donutLegend: { flex: 1, gap: 10 },
  donutLegendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  donutLegendDot: { width: 9, height: 9, borderRadius: 5 },
  donutLegendName: { flex: 1, color: palette.ink, fontSize: 11 },
  donutLegendAmount: { color: palette.muted, fontSize: 10 },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  cardHint: { color: palette.muted, fontSize: 11 },
  travelPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  travelPlanIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.roseSoft,
  },
  settingsActionGrid: { gap: 9 },
  settingsActionButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    backgroundColor: palette.background,
  },
  settingsActionText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  memberPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  avatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.roseSoft,
  },
  avatarText: { color: palette.rose, fontWeight: "800" },
  avatarSmall: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: palette.roseSoft,
  },
  avatarSmallText: { color: palette.rose, fontSize: 12, fontWeight: "800" },
  memberPaymentName: { flex: 1 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  historyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF0EB",
  },
  historyAmount: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  rowTitle: { flexShrink: 1, color: palette.ink, fontSize: 13, fontWeight: "600" },
  rowSubtitle: {
    marginTop: 4,
    flexShrink: 1,
    color: palette.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  rowAmount: { flexShrink: 1, color: palette.ink, fontSize: 13, fontWeight: "700" },
  incomeText: { color: palette.sage },
  insightCard: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    padding: 17,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 19,
    backgroundColor: palette.surface,
  },
  insightText: { flex: 1 },
  insightTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  insightBody: {
    marginTop: 5,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  settlementCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    padding: 17,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  settlementIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: palette.roseSoft,
  },
  settlementText: { flex: 1 },
  settlementTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  settlementBody: {
    marginTop: 5,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: palette.rose,
  },
  smallButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  globalToastLayer: {
    position: "absolute",
    right: 16,
    bottom: 78,
    zIndex: 100,
    elevation: 100,
    maxWidth: "88%",
  },
  globalToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 15,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  globalToastText: { flexShrink: 1, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  keyboardAvoiding: { flex: 1 },
  settingsDivider: { height: 1, marginVertical: 18, backgroundColor: palette.border },
  appVersionText: { marginTop: 5, color: palette.rose, fontSize: 11, fontWeight: "800" },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    backgroundColor: palette.surface,
  },
  reminderDayPicker: { gap: 8, paddingVertical: 8 },
  reminderDay: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    backgroundColor: palette.surface,
  },
  reminderDayActive: { borderColor: palette.rose, backgroundColor: palette.rose },
  reminderDayText: { color: palette.ink, fontWeight: "800" },
  reminderDayTextActive: { color: "#FFFFFF" },
  outlineButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 16,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 13,
    backgroundColor: palette.surface,
  },
  outlineButtonText: { color: palette.rose, fontSize: 12, fontWeight: "700" },
  accountDeletePanel: {
    marginTop: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: palette.roseSoft,
  },
  accountDeleteButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
  },
  accountDeleteButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  dangerButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 14,
    borderWidth: 1,
    borderColor: palette.rose,
    borderRadius: 13,
    backgroundColor: palette.roseSoft,
  },
  dangerButtonText: { color: palette.rose, fontSize: 12, fontWeight: "700" },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#F5ECE7",
  },
  transactionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  barRow: { marginBottom: 15 },
  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  barTrack: {
    height: 8,
    marginTop: 8,
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "#F2E8E3",
  },
  barFill: { height: 8, borderRadius: 5 },
  compareRow: { marginTop: 14, gap: 10 },
  compareItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  compareSwatch: { width: 10, height: 10, borderRadius: 5 },
  progressTrack: {
    height: 10,
    marginTop: 4,
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: "#F2E8E3",
  },
  progressFill: { height: 10, borderRadius: 6 },
  progressHint: { marginTop: 8, color: palette.muted, fontSize: 11 },
  warningText: { color: "#B4575D" },
  budgetRow: { marginBottom: 15 },
  recurringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: "#F5ECE7",
  },
  recurringIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.roseSoft,
  },
  outlineIconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 11,
  },
  dashedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    marginTop: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D9B9B5",
    borderRadius: 13,
  },
  dashedButtonText: { color: palette.rose, fontSize: 13, fontWeight: "700" },
  emptyInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
  },
  emptyInlineText: {
    flex: 1,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  inviteCodeLarge: {
    marginVertical: 9,
    color: palette.rose,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 4,
  },
  qrWrap: {
    alignItems: "center",
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  qrCaption: {
    marginTop: 12,
    color: palette.muted,
    fontSize: 10,
    textAlign: "center",
  },
  rolePill: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: palette.roseSoft,
  },
  rolePillText: { color: palette.rose, fontSize: 10, fontWeight: "700" },
  settingsPillRow: { gap: 8, paddingTop: 12, paddingBottom: 2 },
  settingsFilterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  settingsFilterActions: { flex: 1, flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 6 },
  settingsFilterButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: palette.roseSoft },
  settingsFilterText: { color: palette.rose, fontSize: 11, fontWeight: "700" },
  settingsList: { gap: 7 },
  settingsPreviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  settingsPreviewChip: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "48%", paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: palette.roseSoft },
  settingsPreviewEmoji: { fontSize: 14 },
  settingsPreviewText: { flexShrink: 1, color: palette.ink, fontSize: 11, fontWeight: "700" },
  settingsManagerActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  settingsManagerButton: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  recentTransactionsButton: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  settingsManagerText: { color: palette.rose, fontSize: 11, fontWeight: "800" },
  settingsListRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: palette.border },
  settingsListIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: palette.roseSoft },
  settingsListIconText: { color: palette.rose, fontSize: 17 },
  settingsRemovePill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, backgroundColor: palette.roseSoft, borderWidth: 1, borderColor: palette.border },
  settingsRemovePillText: { color: palette.rose, fontSize: 11, fontWeight: "700" },
  activityLogScroll: { maxHeight: 250 },
  managerScroll: { maxHeight: 390, flexShrink: 1, marginTop: 8 },
  managerInactiveToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 11,
    backgroundColor: palette.surface,
  },
  managerInactiveToggleText: { color: palette.rose, fontSize: 11, fontWeight: "700" },
  managerActionScroll: { maxHeight: 390, flexShrink: 1 },
  managerActionPanel: { gap: 11, paddingTop: 8, paddingBottom: 4 },
  managerActionNotice: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: 14, backgroundColor: palette.roseSoft },
  managerActionNoticeText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 19 },
  activityLogRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, borderBottomWidth: 1, borderBottomColor: palette.border },
  activityLogDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.rose },
  activityLogIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  activityLogSummary: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 8, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 12, backgroundColor: palette.roseSoft },
  activityLogSummaryText: { flex: 1, color: palette.ink, fontSize: 11, fontWeight: "700" },
  activityFilterScroll: { maxHeight: 42, marginBottom: 4 },
  activityFilterRow: { gap: 8, paddingRight: 12 },
  activityFilterChip: { minHeight: 32, alignItems: "center", justifyContent: "center", paddingHorizontal: 11, borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface },
  activityFilterText: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  activityLogContent: { paddingBottom: 10 },
  activityLogTag: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, color: palette.rose, backgroundColor: palette.roseSoft, fontSize: 10, fontWeight: "700" },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 7,
  },
  weekLabel: {
    width: "14.28%",
    color: palette.muted,
    fontSize: 11,
    textAlign: "center",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: {
    width: "14.28%",
    height: 47,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  calendarSelected: { backgroundColor: palette.roseSoft },
  calendarDay: { color: palette.ink, fontSize: 13 },
  calendarDaySelected: { color: palette.rose, fontWeight: "800" },
  calendarDot: { width: 5, height: 5, marginTop: 4, borderRadius: 3 },
  paymentOverviewScroll: { maxHeight: 170 },
  recentTransactionsScroll: { maxHeight: 286 },
  transactionActions: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 6 },
  rowActionButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: palette.roseSoft },
  receiptActions: { flexDirection: "row", gap: 8, marginBottom: 14 },
  receiptButton: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.surface },
  receiptButtonText: { flexShrink: 1, color: palette.rose, fontSize: 11, fontWeight: "700" },
  datePickerTrigger: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderWidth: 1, borderColor: palette.border, borderRadius: 13, backgroundColor: palette.surface },
  datePickerValueRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  datePickerText: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  calendarOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(58,47,43,0.32)" },
  dateCalendarCard: { width: "100%", maxWidth: 360, padding: 18, borderRadius: 22, backgroundColor: palette.surface },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  calendarArrow: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: palette.roseSoft },
  calendarMonthTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  calendarWeekRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  calendarWeekday: { width: "14.28%", color: palette.muted, fontSize: 11, textAlign: "center" },
  calendarDayCell: { width: "14.28%", height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  calendarDayActive: { backgroundColor: palette.rose },
  calendarDayText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  calendarDayTextActive: { color: "#FFFFFF", fontWeight: "800" },
  smallMark: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.roseSoft,
  },
  confirmOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(58,47,43,0.34)" },
  confirmDismiss: { ...StyleSheet.absoluteFillObject },
  confirmCard: { width: "100%", maxWidth: 380, maxHeight: "88%", flexGrow: 0, overflow: "hidden", borderWidth: 1, borderRadius: 26, shadowColor: "#3A2F2B", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  confirmContent: { padding: 22 },
  confirmModalCard: { width: "100%", maxWidth: 380, borderWidth: 1, borderRadius: 24, padding: 20, backgroundColor: palette.surface, borderColor: palette.border },
  confirmIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, marginBottom: 15 },
  confirmTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  confirmMessage: { marginTop: 8, color: palette.muted, fontSize: 13, lineHeight: 20 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  confirmCancel: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14 },
  confirmCancelLink: { alignItems: "center", justifyContent: "center", minHeight: 42, marginTop: 6 },
  confirmCancelText: { fontSize: 13, fontWeight: "700" },
  confirmPrimary: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14 },
  confirmPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  confirmDanger: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: "#B83B49" },
  confirmDangerText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  confirmOptionList: { gap: 9, marginTop: 20 },
  confirmOption: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderWidth: 1, borderRadius: 14 },
  confirmOptionText: { flex: 1, fontSize: 13, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: "rgba(58,47,43,0.28)",
  },
  modalDismiss: { flex: 1 },
  modalScroll: { width: "100%", alignSelf: "center", maxHeight: "92%", flexShrink: 1 },
  modalScrollableContent: { paddingBottom: 12 },
  transactionModalScrollContent: { flexGrow: 1, paddingBottom: 12 },
  modalCard: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    backgroundColor: palette.surface,
  },
  modalFixedCard: { maxHeight: "92%", flexShrink: 1 },
  transactionModalCard: { paddingBottom: 78 },
  modalActionBar: {
    marginHorizontal: -22,
    marginTop: 10,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.border,
  },
  modalTitle: {
    marginTop: 22,
    color: palette.ink,
    fontSize: 22,
    fontWeight: "700",
  },
  modalDescription: {
    marginTop: 8,
    marginBottom: 18,
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    minHeight: 52,
    marginBottom: 14,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    backgroundColor: palette.surface,
    color: palette.ink,
    fontSize: 15,
  },
  textarea: { minHeight: 80, paddingTop: 14, textAlignVertical: "top" },
  field: { marginBottom: 14 },
  fieldLabel: {
    marginBottom: 8,
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  optionScroller: { gap: 8, paddingBottom: 4 },
  optionChip: {
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  optionChipActive: {
    borderColor: palette.rose,
    backgroundColor: palette.roseSoft,
  },
  optionChipText: { flexShrink: 1, color: palette.muted, fontSize: 12 },
  optionChipTextActive: { color: palette.rose, fontWeight: "700" },
  emojiPicker: { marginBottom: 14 },
  emojiPickerRow: { gap: 8, paddingBottom: 4 },
  emojiChoice: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  emojiChoiceActive: { borderColor: palette.rose, backgroundColor: palette.roseSoft },
  emojiChoiceText: { fontSize: 20 },
  segmentRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
  },
  segmentActive: { borderColor: palette.rose, backgroundColor: palette.roseSoft },
  segmentText: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  segmentTextActive: { color: palette.rose },
  miniSegment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 11,
  },
  miniSegmentActive: {
    borderColor: palette.rose,
    backgroundColor: palette.roseSoft,
  },
  miniSegmentText: { flexShrink: 1, color: palette.muted, fontSize: 11, textAlign: "center" },
  miniSegmentTextActive: { color: palette.rose, fontWeight: "700" },
  splitInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  splitMemberName: { flex: 1, flexShrink: 1, color: palette.ink, fontSize: 13, fontWeight: "600" },
  splitInput: {
    width: 130,
    minHeight: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 11,
    backgroundColor: palette.surface,
    color: palette.ink,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: palette.rose,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    backgroundColor: palette.surface,
  },
  secondaryButtonText: { color: palette.rose, fontSize: 15, fontWeight: "700" },
  setupNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
    padding: 12,
    borderRadius: 13,
    backgroundColor: palette.roseSoft,
  },
  setupNoticeCopy: {
    flex: 1,
  },
  setupNoticeTitle: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  setupNoticeBody: {
    marginTop: 3,
    color: palette.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  setupNoticeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: palette.surface,
  },
  setupNoticeButtonText: {
    color: palette.rose,
    fontSize: 12,
    fontWeight: "800",
  },
  errorText: {
    marginBottom: 14,
    color: "#B4575D",
    fontSize: 12,
    lineHeight: 18,
  },
  modalCancel: { alignItems: "center", paddingVertical: 15 },
  modalCancelText: { color: palette.muted, fontSize: 14 },
  modalOptionList: { gap: 8 },
  modalOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    backgroundColor: palette.background,
  },
  emptyText: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  multilineInput: { minHeight: 80, textAlignVertical: "top" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.58 },
  });
};

let styles = createStyles(colors, appearanceDefaults);
