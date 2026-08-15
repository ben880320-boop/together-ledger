import { makeRedirectUri } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { encode as encodeBase64 } from "base-64";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, API_BASE_URL, clearSessionToken, getSessionToken, saveSessionToken } from "../lib/api";

const colors = { background: "#FBF7F3", surface: "#FFFCF9", ink: "#3A2F2B", muted: "#927E75", border: "#EEE1DA", rose: "#B56C78", roseSoft: "#F6E5E5", burgundy: "#5A3E43", sage: "#7E8D70" };
type DrawerAction = "overview" | "calendar" | "analysis" | "planning" | "settings";
type User = { id: number; name: string | null; email: string | null };
type Ledger = { id: number; name: string; type: string; inviteCode: string };
type LedgerMember = { member: { userId: number }; user: { id: number; name: string | null; email: string | null } };
type Analytics = { income: number; expense: number; balance: number; categories: { id: number; name: string; color: string; amount: number }[] };
type Settlement = { balances: { userId: number; net: number }[]; settlement: { fromUserId: number; toUserId: number; amount: number } | null };

const APP_ID = process.env.EXPO_PUBLIC_APP_ID || "HDBmsjkFmtXoV2nyYfgboo";
const OAUTH_PORTAL_URL = (process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL || "https://manus.im").replace(/\/$/, "");
const money = (value: number) => `NT$ ${Math.round(value).toLocaleString("zh-TW")}`;

async function loginWithManus() {
  if (!APP_ID || !OAUTH_PORTAL_URL) throw new Error("尚未設定 Android OAuth。請設定 EXPO_PUBLIC_APP_ID 與 EXPO_PUBLIC_OAUTH_PORTAL_URL。");
  const redirectUri = makeRedirectUri({ scheme: "togetherledger", path: "oauth/callback" });
  const nonce = Crypto.randomUUID();
  const state = encodeBase64(JSON.stringify({ redirectUri, nonce }));
  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  const result = await WebBrowser.openAuthSessionAsync(url.toString(), redirectUri);
  if (result.type !== "success") throw new Error("登入已取消。");
  const callback = new URL(result.url);
  if (callback.searchParams.get("state") !== state) throw new Error("登入回呼驗證失敗，請重新嘗試。");
  const token = callback.searchParams.get("token");
  if (!token) throw new Error("登入完成，但沒有收到 session token。");
  await saveSessionToken(token);
  return api.auth.me.query();
}

export default function IndexScreen() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [activeLedger, setActiveLedger] = useState<Ledger | null>(null);
  const [members, setMembers] = useState<LedgerMember[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ledgerModal, setLedgerModal] = useState<"create" | "join" | null>(null);
  const [ledgerName, setLedgerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [activeAction, setActiveAction] = useState<DrawerAction>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setBusy(true);
    try {
      const nextUser = await api.auth.me.query();
      if (!nextUser) { await clearSessionToken(); setUser(null); setLedgers([]); return; }
      setUser(nextUser as User);
      const nextLedgers = await api.ledger.list.query();
      const ledgerRows = nextLedgers as Array<{ ledger: Ledger }>;
      const ledgerList = ledgerRows.map((row) => row.ledger);
      setLedgers(ledgerList);
      const firstLedger = ledgerList[0] ?? null;
      setActiveLedger(firstLedger);
      if (firstLedger) {
        const [nextMembers, nextAnalytics, nextSettlement] = await Promise.all([
          api.ledger.members.query({ ledgerId: firstLedger.id }),
          api.ledger.analytics.query({ ledgerId: firstLedger.id, month: currentMonth() }),
          api.ledger.settlement.summary.query({ ledgerId: firstLedger.id }),
        ]);
        setMembers(nextMembers as LedgerMember[]);
        setAnalytics(nextAnalytics as Analytics);
        setSettlement(nextSettlement as Settlement);
      } else {
        setMembers([]); setAnalytics(null); setSettlement(null);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "無法載入帳本資料。";
      setError(message);
      if (String(message).includes("UNAUTHORIZED") || String(message).includes("Unauthorized")) { await clearSessionToken(); setUser(null); }
    } finally { setBusy(false); setReady(true); }
  }, []);

  useEffect(() => { getSessionToken().then((token) => { if (token) void loadWorkspace(); else setReady(true); }); }, [loadWorkspace]);

  const handleLogin = async () => {
    setError(""); setBusy(true);
    try { const nextUser = await loginWithManus(); setUser(nextUser as User); await loadWorkspace(); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "登入失敗，請稍後再試。"); }
    finally { setBusy(false); setReady(true); }
  };

  const finishLedgerAction = async () => {
    setError("");
    if (!ledgerModal) return;
    if (ledgerModal === "create" && !ledgerName.trim()) { setError("請輸入帳本名稱。"); return; }
    if (ledgerModal === "join" && inviteCode.trim().length < 4) { setError("請輸入有效的邀請碼。"); return; }
    setBusy(true);
    try {
      if (ledgerModal === "create") await api.ledger.create.mutate({ name: ledgerName.trim(), type: "couple" });
      else {
        const joined = await api.ledger.join.mutate({ inviteCode: inviteCode.trim().toUpperCase() });
        if (!joined) throw new Error("找不到這組邀請碼，請確認後再試。");
      }
      setLedgerModal(null); setLedgerName(""); setInviteCode(""); await loadWorkspace();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "帳本操作失敗。"); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await api.auth.logout.mutate(); } catch { /* token removal remains authoritative on native */ }
    await clearSessionToken(); setUser(null); setLedgers([]); setActiveLedger(null); setDrawerOpen(false); setBusy(false);
  };

  if (!ready) return <View style={styles.loadingScreen}><ActivityIndicator color={colors.rose} /><Text style={styles.loadingText}>正在準備共帳…</Text></View>;
  if (!user) return <LoginScreen error={error} busy={busy} onLogin={handleLogin} />;
  if (ledgers.length === 0) return <><AppHeader title="共帳" caption="建立你的共同財務空間" onMenu={() => setDrawerOpen(true)} /><EmptyLedger error={error} onCreate={() => { setError(""); setLedgerModal("create"); }} onJoin={() => { setError(""); setLedgerModal("join"); }} /><Drawer open={drawerOpen} active={activeAction} onSelect={(action) => { setActiveAction(action); setDrawerOpen(false); }} onLogout={logout} /><LedgerModal mode={ledgerModal} ledgerName={ledgerName} inviteCode={inviteCode} error={error} busy={busy} setLedgerName={setLedgerName} setInviteCode={setInviteCode} onClose={() => { setError(""); setLedgerModal(null); }} onSubmit={finishLedgerAction} /></>;

  return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}><AppHeader title={activeAction === "overview" ? "總覽" : actionLabel(activeAction)} caption={activeLedger?.name || "共同帳本"} onMenu={() => setDrawerOpen(true)} action={<Pressable onPress={() => setLedgerModal("create")} style={styles.headerAddButton}><MaterialCommunityIcons name="plus" size={19} color="#FFFFFF" /></Pressable>} /><ScrollView contentContainerStyle={styles.overviewContent}><LedgerOverview ledger={activeLedger!} members={members} analytics={analytics} settlement={settlement} /></ScrollView><Drawer open={drawerOpen} active={activeAction} onSelect={(action) => { setActiveAction(action); setDrawerOpen(false); }} onLogout={logout} /><LedgerModal mode={ledgerModal} ledgerName={ledgerName} inviteCode={inviteCode} error={error} busy={busy} setLedgerName={setLedgerName} setInviteCode={setInviteCode} onClose={() => { setError(""); setLedgerModal(null); }} onSubmit={finishLedgerAction} /></SafeAreaView>;
}

function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function actionLabel(action: DrawerAction) { return ({ overview: "總覽", calendar: "月曆", analysis: "分析", planning: "規劃", settings: "設定" })[action]; }

function LoginScreen({ error, busy, onLogin }: { error: string; busy: boolean; onLogin: () => void }) {
  return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}><ScrollView contentContainerStyle={styles.loginContent}><View style={styles.brandMark}><MaterialCommunityIcons name="heart" size={28} color={colors.rose} /></View><Text style={styles.brandTitle}>共帳</Text><Text style={styles.brandSubtitle}>TOGETHER LEDGER</Text><Text style={styles.loginHeading}>和重要的人，{"\n"}一起把生活記清楚。</Text><Text style={styles.loginDescription}>專為情侶、室友與家庭設計的共同帳本。</Text><View style={styles.formCard}><Text style={styles.formTitle}>登入共帳</Text><Text style={styles.formBody}>使用 Manus 帳號登入，帳本會安全同步到你的裝置。</Text>{!!error && <Text style={styles.errorText}>{error}</Text>}<Pressable disabled={busy} onPress={onLogin} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? "登入中…" : "使用 Manus 登入"}</Text>{busy ? <ActivityIndicator color="#FFFFFF" /> : <MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />}</Pressable><Text style={styles.apiHint}>API：{API_BASE_URL}</Text></View><Text style={styles.privacyText}>登入後不會自動建立帳本，所有帳本都由你主動建立或加入。</Text></ScrollView></SafeAreaView>;
}

function AppHeader({ title, caption, onMenu, action }: { title: string; caption: string; onMenu: () => void; action?: React.ReactNode }) {
  return <SafeAreaView edges={["top"]} style={styles.headerSafe}><View style={styles.appHeader}><Pressable accessibilityLabel="開啟側邊選單" accessibilityRole="button" hitSlop={12} onPress={onMenu} style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}><MaterialCommunityIcons name="menu" size={25} color={colors.ink} /></Pressable><View style={styles.headerTitleWrap}><Text style={styles.headerTitle}>{title}</Text><Text style={styles.headerCaption}>{caption}</Text></View>{action || <View style={styles.headerSpacer} />}</View></SafeAreaView>;
}

function EmptyLedger({ error, onCreate, onJoin }: { error: string; onCreate: () => void; onJoin: () => void }) {
  return <SafeAreaView style={styles.screen} edges={["bottom"]}><ScrollView contentContainerStyle={styles.emptyContent}><View style={styles.emptyIllustration}><MaterialCommunityIcons name="book-heart-outline" size={52} color={colors.rose} /></View><Text style={styles.emptyTitle}>目前還沒有帳本</Text><Text style={styles.emptyDescription}>建立一個新的共同帳本，或輸入邀請碼加入伴侶、室友或家人的帳本。</Text>{!!error && <Text style={styles.errorText}>{error}</Text>}<Pressable onPress={onCreate} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" /><Text style={styles.primaryButtonText}>建立第一個帳本</Text></Pressable><Pressable onPress={onJoin} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><MaterialCommunityIcons name="account-multiple-plus-outline" size={20} color={colors.rose} /><Text style={styles.secondaryButtonText}>使用邀請碼加入</Text></Pressable></ScrollView></SafeAreaView>;
}

function LedgerOverview({ ledger, members, analytics, settlement }: { ledger: Ledger; members: LedgerMember[]; analytics: Analytics | null; settlement: Settlement | null }) {
  const memberNames = members.map((item) => item.user.name || item.user.email || "成員").join(" & ");
  const topCategory = analytics?.categories[0];
  return <><View style={styles.heroCard}><Text style={styles.heroEyebrow}>{ledger.type === "couple" ? "情侶共同帳本" : "共同帳本"}</Text><Text style={styles.heroTitle}>{ledger.name}</Text><Text style={styles.heroBody}>把每一份共同支出清楚記下來，讓生活更透明。</Text><View style={styles.heroFooter}><MaterialCommunityIcons name="account-multiple-outline" size={17} color="#F8E9E5" /><Text style={styles.heroFooterText}>{members.length} 位成員{memberNames ? ` · ${memberNames}` : ""}</Text></View></View><View style={styles.statRow}><View style={styles.statCard}><Text style={styles.statLabel}>本月收入</Text><Text style={styles.statValue}>{money(analytics?.income || 0)}</Text></View><View style={styles.statCard}><Text style={styles.statLabel}>本月支出</Text><Text style={styles.statValue}>{money(analytics?.expense || 0)}</Text></View></View><View style={styles.balanceCard}><View><Text style={styles.balanceLabel}>本月結餘</Text><Text style={styles.balanceValue}>{money(analytics?.balance || 0)}</Text></View><MaterialCommunityIcons name="chart-donut" size={36} color={colors.rose} /></View><View style={styles.insightCard}><MaterialCommunityIcons name="star-outline" size={21} color={colors.rose} /><View style={styles.insightText}><Text style={styles.insightTitle}>共同財務摘要</Text><Text style={styles.insightBody}>{topCategory ? `本月最高支出分類是「${topCategory.name}」，共 ${money(topCategory.amount)}。` : "目前還沒有收支記錄，新增第一筆交易後會在這裡看到分析。"}</Text></View></View><View style={styles.settlementCard}><View style={styles.settlementIcon}><MaterialCommunityIcons name="hand-coin-outline" size={22} color={colors.rose} /></View><View style={styles.settlementText}><Text style={styles.settlementTitle}>目前結算狀態</Text><Text style={styles.settlementBody}>{settlement?.settlement ? `尚有 ${money(settlement.settlement.amount)} 待結算。` : "目前沒有待結算差額。"}</Text></View></View></>;
}

function Drawer({ open, active, onSelect, onLogout }: { open: boolean; active: DrawerAction; onSelect: (action: DrawerAction) => void; onLogout: () => void }) {
  const items: { key: DrawerAction; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [{ key: "overview", label: "總覽", icon: "view-dashboard-outline" }, { key: "calendar", label: "月曆", icon: "calendar-month-outline" }, { key: "analysis", label: "分析", icon: "chart-line" }, { key: "planning", label: "規劃", icon: "wallet-outline" }, { key: "settings", label: "設定", icon: "tune-variant" }];
  return <Modal visible={open} transparent animationType="fade" onRequestClose={() => onSelect(active)}><View style={styles.drawerBackdrop}><Pressable style={styles.drawerDismiss} onPress={() => onSelect(active)} /><View style={styles.drawer}><View style={styles.drawerBrand}><View style={styles.smallMark}><MaterialCommunityIcons name="heart" size={17} color={colors.rose} /></View><Text style={styles.drawerTitle}>共帳</Text></View><Text style={styles.drawerCaption}>TOGETHER LEDGER</Text><View style={styles.drawerDivider} />{items.map((item) => <Pressable key={item.key} onPress={() => onSelect(item.key)} style={({ pressed }) => [styles.drawerItem, active === item.key && styles.drawerItemActive, pressed && styles.pressed]}><MaterialCommunityIcons name={item.icon} size={20} color={active === item.key ? colors.rose : colors.muted} /><Text style={[styles.drawerItemText, active === item.key && styles.drawerItemTextActive]}>{item.label}</Text></Pressable>)}<View style={styles.drawerBottom}><Pressable onPress={onLogout} style={styles.logoutButton}><MaterialCommunityIcons name="logout" size={19} color={colors.muted} /><Text style={styles.logoutText}>登出</Text></Pressable></View></View></View></Modal>;
}

function LedgerModal({ mode, ledgerName, inviteCode, error, busy, setLedgerName, setInviteCode, onClose, onSubmit }: { mode: "create" | "join" | null; ledgerName: string; inviteCode: string; error: string; busy: boolean; setLedgerName: (value: string) => void; setInviteCode: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <Modal visible={Boolean(mode)} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><Pressable style={styles.modalDismiss} onPress={onClose} /><View style={styles.modalCard}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>{mode === "create" ? "建立共同帳本" : "加入共同帳本"}</Text><Text style={styles.modalDescription}>{mode === "create" ? "先為你們的共同空間取一個名字。" : "輸入對方分享給你的邀請碼。"}</Text>{mode === "create" ? <TextInput value={ledgerName} onChangeText={setLedgerName} placeholder="例如：小辰 & 安安" placeholderTextColor="#B9A69E" style={styles.input} autoFocus /> : <TextInput value={inviteCode} onChangeText={setInviteCode} placeholder="輸入邀請碼" placeholderTextColor="#B9A69E" style={styles.input} autoCapitalize="characters" autoFocus />}{!!error && <Text style={styles.errorText}>{error}</Text>}<Pressable disabled={busy} onPress={onSubmit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? "處理中…" : mode === "create" ? "建立帳本" : "加入帳本"}</Text>{busy && <ActivityIndicator color="#FFFFFF" />}</Pressable><Pressable onPress={onClose} style={styles.modalCancel}><Text style={styles.modalCancelText}>取消</Text></Pressable></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, screen: { flex: 1, backgroundColor: colors.background }, loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }, loadingText: { marginTop: 12, color: colors.muted, fontSize: 13 }, headerSafe: { backgroundColor: colors.surface }, loginContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 42, paddingBottom: 30 }, brandMark: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.roseSoft }, brandTitle: { marginTop: 13, color: colors.ink, fontSize: 26, fontWeight: "700", letterSpacing: 1 }, brandSubtitle: { marginTop: 2, color: "#B69E94", fontSize: 9, letterSpacing: 2.4 }, loginHeading: { marginTop: 52, color: colors.ink, fontSize: 31, fontWeight: "700", lineHeight: 42 }, loginDescription: { marginTop: 14, color: colors.muted, fontSize: 15, lineHeight: 23 }, formCard: { marginTop: 34, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface }, formTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" }, formBody: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 21 }, apiHint: { marginTop: 14, color: "#B7A69E", fontSize: 10 }, errorText: { marginBottom: 14, color: "#B4575D", fontSize: 12, lineHeight: 18 }, primaryButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: colors.rose }, primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.5 }, secondaryButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, borderWidth: 1, borderColor: "#E3C3C4", borderRadius: 16, backgroundColor: colors.surface }, secondaryButtonText: { color: colors.rose, fontSize: 15, fontWeight: "700" }, privacyText: { marginTop: 22, color: "#AE9C94", fontSize: 12, lineHeight: 19, textAlign: "center" }, appHeader: { minHeight: 74, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border }, menuButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14 }, headerTitleWrap: { flex: 1, marginLeft: 8 }, headerTitle: { color: colors.ink, fontSize: 21, fontWeight: "700" }, headerCaption: { marginTop: 2, color: colors.muted, fontSize: 11 }, headerAddButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.rose }, headerSpacer: { width: 44 }, emptyContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 48 }, emptyIllustration: { width: 104, height: 104, alignItems: "center", justifyContent: "center", borderRadius: 34, backgroundColor: colors.roseSoft }, emptyTitle: { marginTop: 25, color: colors.ink, fontSize: 28, fontWeight: "700" }, emptyDescription: { maxWidth: 330, marginTop: 12, color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "center" }, overviewContent: { padding: 20, paddingBottom: 40 }, heroCard: { padding: 24, borderRadius: 25, backgroundColor: colors.burgundy }, heroEyebrow: { color: "#E8C9CA", fontSize: 12, letterSpacing: 1 }, heroTitle: { marginTop: 12, color: "#FFFFFF", fontSize: 29, fontWeight: "700" }, heroBody: { marginTop: 10, color: "#E7D6D1", fontSize: 14, lineHeight: 22 }, heroFooter: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 24 }, heroFooterText: { color: "#F8E9E5", fontSize: 12 }, statRow: { flexDirection: "row", gap: 12, marginTop: 14 }, statCard: { flex: 1, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 19, backgroundColor: colors.surface }, statLabel: { color: colors.muted, fontSize: 12 }, statValue: { marginTop: 9, color: colors.ink, fontSize: 18, fontWeight: "700" }, balanceCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: 18, borderRadius: 19, backgroundColor: colors.roseSoft }, balanceLabel: { color: colors.muted, fontSize: 12 }, balanceValue: { marginTop: 7, color: colors.ink, fontSize: 23, fontWeight: "700" }, insightCard: { flexDirection: "row", gap: 12, marginTop: 14, padding: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 19, backgroundColor: colors.surface }, insightText: { flex: 1 }, insightTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" }, insightBody: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 19 }, settlementCard: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 17, borderRadius: 19, backgroundColor: "#FFF5F0" }, settlementIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#FFE3DB" }, settlementText: { flex: 1 }, settlementTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" }, settlementBody: { marginTop: 5, color: colors.muted, fontSize: 12 }, drawerBackdrop: { flex: 1, flexDirection: "row", backgroundColor: "rgba(58,47,43,0.26)" }, drawerDismiss: { flex: 1 }, drawer: { width: 286, paddingHorizontal: 20, paddingTop: 60, backgroundColor: colors.surface, shadowColor: "#3A2F2B", shadowOpacity: 0.15, shadowRadius: 18, elevation: 12 }, drawerBrand: { flexDirection: "row", alignItems: "center", gap: 10 }, smallMark: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.roseSoft }, drawerTitle: { color: colors.ink, fontSize: 22, fontWeight: "700" }, drawerCaption: { marginTop: 5, marginLeft: 46, color: "#B69E94", fontSize: 9, letterSpacing: 2 }, drawerDivider: { height: 1, marginVertical: 26, backgroundColor: colors.border }, drawerItem: { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 48, paddingHorizontal: 13, borderRadius: 14 }, drawerItemActive: { backgroundColor: colors.roseSoft }, drawerItemText: { color: colors.muted, fontSize: 14 }, drawerItemTextActive: { color: colors.rose, fontWeight: "700" }, drawerBottom: { flex: 1, justifyContent: "flex-end", paddingBottom: 24 }, logoutButton: { flexDirection: "row", alignItems: "center", gap: 13, padding: 13 }, logoutText: { color: colors.muted, fontSize: 14 }, modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(58,47,43,0.28)" }, modalDismiss: { flex: 1 }, modalCard: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface }, modalHandle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#E4D6CF" }, modalTitle: { marginTop: 22, color: colors.ink, fontSize: 22, fontWeight: "700" }, modalDescription: { marginTop: 8, marginBottom: 18, color: colors.muted, fontSize: 13, lineHeight: 20 }, input: { minHeight: 52, marginBottom: 14, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: "#FFFAF7", color: colors.ink, fontSize: 15 }, modalCancel: { alignItems: "center", paddingVertical: 15 }, modalCancelText: { color: colors.muted, fontSize: 14 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.58 } });
