import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { encode as encodeBase64 } from "base-64";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  api,
  API_BASE_URL,
  clearSessionToken,
  getSessionToken,
  saveSessionToken,
} from "../lib/api";

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
type DrawerAction =
  | "overview"
  | "calendar"
  | "analysis"
  | "planning"
  | "settings";
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
};
type PaymentMethod = { id: number; name: string; icon: string };
type Transaction = {
  id: number;
  amount: number;
  type: "expense" | "income" | "transfer";
  payerId: number;
  categoryId: number;
  paymentMethodId: number;
  date: Date | string;
  note: string | null;
  splitType: "equal" | "custom" | "amount";
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

const APP_ID = process.env.EXPO_PUBLIC_APP_ID || "HDBmsjkFmtV0V2nyYfgboo";
const OAUTH_PORTAL_URL = (
  process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL || "https://manus.im"
).replace(/\/$/, "");
const money = (value: number) =>
  `NT$ ${Math.round(value || 0).toLocaleString("zh-TW")}`;
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

async function loginWithManus(mode: "signIn" | "signUp" = "signIn") {
  const redirectUri = makeRedirectUri({
    scheme: "togetherledger",
    path: "oauth/callback",
  });
  const nonce = Crypto.randomUUID();
  const state = encodeBase64(JSON.stringify({ redirectUri, nonce }));
  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", mode);
  const result = await WebBrowser.openAuthSessionAsync(
    url.toString(),
    redirectUri
  );
  if (result.type !== "success") throw new Error("登入已取消。");
  const callback = new URL(result.url);
  if (callback.searchParams.get("state") !== state)
    throw new Error("登入回呼驗證失敗，請重新嘗試。");
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
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ledgerModal, setLedgerModal] = useState<"create" | "join" | null>(
    null
  );
  const [transactionModal, setTransactionModal] = useState(false);
  const [budgetModal, setBudgetModal] = useState(false);
  const [recurringModal, setRecurringModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState<
    "category" | "payment" | null
  >(null);
  const [ledgerName, setLedgerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pendingInviteCode, setPendingInviteCode] = useState("");
  const [ledgerType, setLedgerType] = useState<"couple" | "roommate" | "family">("couple");
  const [activeAction, setActiveAction] = useState<DrawerAction>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reloadLedger = useCallback(async (ledgerId: number) => {
    await api.ledger.syncRecurring.mutate({ ledgerId }).catch(() => undefined);
    const month = currentMonth();
    const [
      nextMembers,
      nextCategories,
      nextPayments,
      nextTransactions,
      nextCalendar,
      nextAnalytics,
      nextPreviousAnalytics,
      nextSettlement,
      nextHistory,
      nextBudgets,
      nextRecurring,
    ] = await Promise.all([
      api.ledger.members.query({ ledgerId }),
      api.ledger.categories.query({ ledgerId }),
      api.ledger.paymentMethods.query({ ledgerId }),
      api.ledger.transactions.query({ ledgerId, limit: 200 }),
      api.ledger.calendar.query({ ledgerId, month }),
      api.ledger.analytics.query({ ledgerId, month }),
      api.ledger.analytics.query({ ledgerId, month: previousMonth() }),
      api.ledger.settlement.summary.query({ ledgerId }),
      api.ledger.settlement.history.query({ ledgerId }),
      api.ledger.budgets.query({ ledgerId, month }),
      api.ledger.recurring.query({ ledgerId }),
    ]);
    setMembers(nextMembers as LedgerMember[]);
    setCategories(nextCategories as Category[]);
    setPaymentMethods(nextPayments as PaymentMethod[]);
    setTransactions(nextTransactions as Transaction[]);
    setCalendarTransactions(nextCalendar as Transaction[]);
    setAnalytics(nextAnalytics as Analytics);
    setPreviousAnalytics(nextPreviousAnalytics as Analytics);
    setSettlement(nextSettlement as Settlement);
    setSettlementHistory(nextHistory as SettlementHistory[]);
    setBudgets(nextBudgets as Budget[]);
    setRecurring(nextRecurring as Recurring[]);
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
      const rows = (await api.ledger.list.query()) as Array<{ ledger: Ledger }>;
      const nextLedgers = rows.map(row => row.ledger);
      setLedgers(nextLedgers);
      const nextLedger = nextLedgers[0] ?? null;
      setActiveLedger(nextLedger);
      if (nextLedger) await reloadLedger(nextLedger.id);
      else {
        setMembers([]);
        setCategories([]);
        setPaymentMethods([]);
        setTransactions([]);
        setAnalytics(null);
        setSettlement(null);
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
    if (!ready || !user || !pendingInviteCode || ledgerModal) return;
    setInviteCode(pendingInviteCode);
    setPendingInviteCode("");
    setError("");
    setLedgerModal("join");
  }, [ready, user, pendingInviteCode, ledgerModal]);

  const selectLedger = async (ledger: Ledger) => {
    setActiveLedger(ledger);
    setDrawerOpen(false);
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
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (activeLedger) {
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
  const handleLogin = async (mode: "signIn" | "signUp" = "signIn") => {
    setError("");
    setBusy(true);
    try {
      await loginWithManus(mode);
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
    if (ledgerModal === "create" && !ledgerName.trim()) {
      setError("請輸入帳本名稱。");
      return;
    }
    if (ledgerModal === "join" && inviteCode.trim().length < 4) {
      setError("請輸入有效的邀請碼。");
      return;
    }
    setBusy(true);
    try {
      if (ledgerModal === "create")
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
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "帳本操作失敗。"
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await api.auth.logout.mutate();
    } catch {
      /* native token removal remains authoritative */
    }
    await clearSessionToken();
    setUser(null);
    setLedgers([]);
    setActiveLedger(null);
    setDrawerOpen(false);
    setBusy(false);
  };
  const afterMutation = async () => {
    setTransactionModal(false);
    setBudgetModal(false);
    setRecurringModal(false);
    setSettingsModal(null);
    await refresh();
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
  if (ledgers.length === 0)
    return (
      <>
        <AppHeader
          title="共帳"
          caption="建立你的共同財務空間"
          onMenu={() => setDrawerOpen(true)}
        />
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
        <Drawer
          open={drawerOpen}
          active={activeAction}
          onSelect={action => {
            setActiveAction(action);
            setDrawerOpen(false);
          }}
          onLogout={logout}
        />
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
      </>
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
        onAdd={() => setTransactionModal(true)}
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
        categories={categories}
        recurring={recurring}
        onBudget={() => setBudgetModal(true)}
        onRecurring={() => setRecurringModal(true)}
      />
    ) : (
      <SettingsSection
        ledger={activeLedger!}
        user={user}
        members={members}
        categories={categories}
        paymentMethods={paymentMethods}
        history={settlementHistory}
        onCategory={() => setSettingsModal("category")}
        onPayment={() => setSettingsModal("payment")}
        onRefresh={refresh}
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
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <AppHeader
        title={actionLabel(activeAction)}
        caption={activeLedger?.name || "共同帳本"}
        onMenu={() => setDrawerOpen(true)}
        action={
          <Pressable onPress={refresh} style={styles.headerAddButton}>
            <MaterialCommunityIcons
              name={busy ? "sync" : "refresh"}
              size={19}
              color="#FFFFFF"
            />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.pageContent}>
        <LedgerSelector
          ledgers={ledgers}
          activeLedgerId={activeLedger!.id}
          onSelect={selectLedger}
        />
        {!!error && <Text style={styles.globalError}>{error}</Text>}
        {content}
      </ScrollView>
      <Drawer
        open={drawerOpen}
        active={activeAction}
        onSelect={action => {
          setActiveAction(action);
          setDrawerOpen(false);
        }}
        onLogout={logout}
      />
      <TransactionModal
        visible={transactionModal}
        user={user}
        members={members}
        categories={categories}
        paymentMethods={paymentMethods}
        error={error}
        onClose={() => setTransactionModal(false)}
        onSetupPayment={() => {
          setTransactionModal(false);
          setActiveAction("settings");
          setSettingsModal("payment");
        }}
        onSubmit={async input => {
          try {
            await api.ledger.createTransaction.mutate({
              ledgerId: activeLedger!.id,
              ...input,
            });
            await afterMutation();
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "新增交易失敗。"
            );
          }
        }}
      />
      <BudgetModal
        visible={budgetModal}
        categories={categories}
        currentMonth={currentMonth()}
        ledgerId={activeLedger!.id}
        onClose={() => setBudgetModal(false)}
        onSubmit={async input => {
          try {
            await api.ledger.upsertBudget.mutate(input);
            await afterMutation();
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "預算儲存失敗。"
            );
          }
        }}
      />
      <RecurringModal
        visible={recurringModal}
        categories={categories}
        paymentMethods={paymentMethods}
        ledgerId={activeLedger!.id}
        onClose={() => setRecurringModal(false)}
        onSubmit={async input => {
          try {
            await api.ledger.createRecurring.mutate({
              ledgerId: activeLedger!.id,
              ...input,
            });
            await afterMutation();
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "固定收支儲存失敗。"
            );
          }
        }}
      />
      <SettingsModal
        visible={settingsModal !== null}
        mode={settingsModal || "category"}
        ledgerId={activeLedger!.id}
        categories={categories}
        onClose={() => setSettingsModal(null)}
        onSubmit={async input => {
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
            await afterMutation();
          } catch (mutationError) {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "設定儲存失敗。"
            );
          }
        }}
      />
    </SafeAreaView>
  );
}

function LoginScreen({
  error,
  busy,
  onLogin,
}: {
  error: string;
  busy: boolean;
  onLogin: (mode: "signIn" | "signUp") => void;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.loginContent}>
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
            第一次使用會先完成 Manus 帳號登入；登入後不會自動建立任何帳本。
          </Text>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable
            disabled={busy}
            onPress={() => onLogin("signIn")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {busy ? "處理中…" : "登入"}
            </Text>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons
                name="arrow-right"
                size={19}
                color="#FFFFFF"
              />
            )}
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => onLogin("signUp")}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>第一次使用？建立帳號</Text>
          </Pressable>
        </View>
        <Text style={styles.privacyText}>
          登入後所有帳本都由你主動建立或加入，不會出現預設資料。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function AppHeader({
  title,
  caption,
  onMenu,
  action,
}: {
  title: string;
  caption: string;
  onMenu: () => void;
  action?: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top"]} style={styles.headerSafe}>
      <View style={styles.appHeader}>
        <Pressable
          accessibilityLabel="開啟側邊選單"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onMenu}
          style={({ pressed }) => [
            styles.menuButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="menu" size={25} color={colors.ink} />
        </Pressable>
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
              color={ledger.id === activeLedgerId ? colors.rose : colors.muted}
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

function EmptyLedger({
  error,
  onCreate,
  onJoin,
}: {
  error: string;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
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
  onSettle: () => void;
}) {
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
          color={colors.rose}
        />
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>雙方支付總覽</Text>
          <Text style={styles.cardHint}>本月</Text>
        </View>
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
      </View>
      <View style={styles.insightCard}>
        <MaterialCommunityIcons
          name="star-outline"
          size={21}
          color={colors.rose}
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
            color={colors.rose}
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
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <MaterialCommunityIcons name={icon} size={17} color={colors.rose} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function CalendarSection({
  transactions,
  categories,
}: {
  transactions: Transaction[];
  categories: Category[];
}) {
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
                            ? colors.orange
                            : colors.sage,
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
            />
          ))
        )}
      </View>
    </>
  );
}

function AnalysisSection({
  analytics,
  previousAnalytics,
}: {
  analytics: Analytics | null;
  previousAnalytics: Analytics | null;
}) {
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
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>支出分類</Text>
          <MaterialCommunityIcons
            name="chart-donut"
            size={20}
            color={colors.rose}
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
            color={colors.rose}
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
  categories,
  recurring,
  onBudget,
  onRecurring,
}: {
  analytics: Analytics | null;
  budgets: Budget[];
  categories: Category[];
  recurring: Recurring[];
  onBudget: () => void;
  onRecurring: () => void;
}) {
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
              color={colors.rose}
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
                      totalPercent >= 100 ? "#C25C5C" : colors.rose,
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
                    {category?.icon || "◌"} {category?.name || "分類"}
                  </Text>
                  <Text style={styles.rowAmount}>
                    {money(amount)} / {money(budget.amount)}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(percent ? 5 : 0, percent)}%`,
                        backgroundColor:
                          percent >= 100 ? "#C25C5C" : colors.sage,
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
            <MaterialCommunityIcons name="plus" size={18} color={colors.rose} />
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
                  color={item.type === "expense" ? colors.rose : colors.sage}
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
            </View>
          ))
        )}
      </View>
    </>
  );
}

function SettingsSection({
  ledger,
  user,
  members,
  categories,
  paymentMethods,
  history,
  onCategory,
  onPayment,
  onRefresh,
  onRoleChange,
}: {
  ledger: Ledger;
  user: User;
  members: LedgerMember[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
    history: SettlementHistory[];
  onCategory: () => void;
  onPayment: () => void;
  onRefresh: () => void;
  onRoleChange: (memberId: number, role: "admin" | "member" | "viewer") => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const me = members.find(item => item.user.id === user.id);
  const isAdmin = me?.member.role === "admin";
  const inviteLink = `togetherledger://join?code=${ledger.inviteCode}`;
  const shareInvite = async () => {
    await Share.share({
      message: `加入我的共帳「${ledger.name}」\n邀請碼：${ledger.inviteCode}\n邀請連結：${inviteLink}`,
    });
  };
  const addPresets = async () => {
    const presets = [
      { name: "飲食", icon: "🍜", type: "expense" as const },
      { name: "交通", icon: "🚗", type: "expense" as const },
      { name: "生活", icon: "⌂", type: "expense" as const },
      { name: "購物", icon: "◌", type: "expense" as const },
      { name: "情侶", icon: "♡", type: "expense" as const },
      { name: "薪資", icon: "↗", type: "income" as const },
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
        color: colors.rose,
      });
    onRefresh();
  };
  const addPaymentPresets = async () => {
    const presets = [
      { name: "現金", icon: "現" },
      { name: "信用卡", icon: "卡" },
      { name: "電子支付", icon: "支" },
      { name: "銀行轉帳", icon: "銀" },
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
  return (
    <>
      <SectionIntro
        eyebrow="LEDGER SETTINGS"
        title="把共同空間設定好"
        body="帳本不會預先建立交易、預算或固定收支；分類與支付方式依 pasted_content.txt 提供必要預設，也能繼續新增自訂項目。"
      />
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>邀請成員</Text>
          <Pressable onPress={shareInvite} style={styles.outlineIconButton}>
            <MaterialCommunityIcons
              name="share-variant"
              size={18}
              color={colors.rose}
            />
          </Pressable>
        </View>
        <Text style={styles.inviteCodeLarge}>{ledger.inviteCode}</Text>
        <Text style={styles.rowSubtitle}>
          邀請碼可分享給伴侶、室友或家人；也支援 deep link 邀請。
        </Text>
        <Pressable
          onPress={() => setShowQr(value => !value)}
          style={styles.dashedButton}
        >
          <MaterialCommunityIcons name="qrcode" size={17} color={colors.rose} />
          <Text style={styles.dashedButtonText}>
            {showQr ? "收起 QR Code" : "顯示 QR Code"}
          </Text>
        </Pressable>
        {showQr && (
          <View style={styles.qrWrap}>
            <QRCode
              value={inviteLink}
              size={156}
              color={colors.ink}
              backgroundColor={colors.surface}
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
                color={colors.muted}
              />
            )}
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>分類</Text>
          <Pressable onPress={onCategory} style={styles.outlineIconButton}>
            <MaterialCommunityIcons name="plus" size={18} color={colors.rose} />
          </Pressable>
        </View>
        {categories.length === 0 ? (
          <>
            <EmptyInline text="目前沒有分類。" />
            <Pressable onPress={addPresets} style={styles.dashedButton}>
              <Text style={styles.dashedButtonText}>加入預設分類建議</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.rowSubtitle}>
            {categories.map(item => `${item.icon} ${item.name}`).join("　")}
          </Text>
        )}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>支付方式</Text>
          <Pressable onPress={onPayment} style={styles.outlineIconButton}>
            <MaterialCommunityIcons name="plus" size={18} color={colors.rose} />
          </Pressable>
        </View>
        {paymentMethods.length === 0 ? (
          <>
            <EmptyInline text="目前沒有支付方式。" />
            <Pressable onPress={addPaymentPresets} style={styles.dashedButton}>
              <Text style={styles.dashedButtonText}>加入常用支付方式建議</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.rowSubtitle}>
            {paymentMethods.map(item => `${item.icon} ${item.name}`).join("　")}
          </Text>
        )}
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
                  <MaterialCommunityIcons name="check" size={16} color={colors.sage} />
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
}: {
  transaction: Transaction;
  categories: Category[];
}) {
  const category = categories.find(item => item.id === transaction.categoryId);
  return (
    <View style={styles.transactionRow}>
      <View
        style={[
          styles.transactionIcon,
          {
            backgroundColor:
              transaction.type === "income" ? "#E6F0E3" : colors.roseSoft,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={
            transaction.type === "income" ? "cash-plus" : "receipt-text-outline"
          }
          size={18}
          color={transaction.type === "income" ? colors.sage : colors.rose}
        />
      </View>
      <View style={styles.memberPaymentName}>
        <Text style={styles.rowTitle}>
          {category?.icon || "◌"} {category?.name || "未分類"}
        </Text>
        <Text style={styles.rowSubtitle}>{transaction.note || "共同收支"}</Text>
      </View>
      <Text
        style={[
          styles.rowAmount,
          transaction.type === "income" && styles.incomeText,
        ]}
      >
        {transaction.type === "income" ? "+" : "-"}
        {money(transaction.amount)}
      </Text>
    </View>
  );
}

function Drawer({
  open,
  active,
  onSelect,
  onLogout,
}: {
  open: boolean;
  active: DrawerAction;
  onSelect: (action: DrawerAction) => void;
  onLogout: () => void;
}) {
  const items: {
    key: DrawerAction;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }[] = [
    { key: "overview", label: "總覽", icon: "view-dashboard-outline" },
    { key: "calendar", label: "月曆", icon: "calendar-month-outline" },
    { key: "analysis", label: "分析", icon: "chart-line" },
    { key: "planning", label: "規劃", icon: "wallet-outline" },
    { key: "settings", label: "設定", icon: "tune-variant" },
  ];
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onSelect(active)}
    >
      <View style={styles.drawerBackdrop}>
        <Pressable
          style={styles.drawerDismiss}
          onPress={() => onSelect(active)}
        />
        <View style={styles.drawer}>
          <View style={styles.drawerBrand}>
            <View style={styles.smallMark}>
              <MaterialCommunityIcons
                name="heart"
                size={17}
                color={colors.rose}
              />
            </View>
            <Text style={styles.drawerTitle}>共帳</Text>
          </View>
          <Text style={styles.drawerCaption}>TOGETHER LEDGER</Text>
          <View style={styles.drawerDivider} />
          {items.map(item => (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [
                styles.drawerItem,
                active === item.key && styles.drawerItemActive,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={20}
                color={active === item.key ? colors.rose : colors.muted}
              />
              <Text
                style={[
                  styles.drawerItemText,
                  active === item.key && styles.drawerItemTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
          <View style={styles.drawerBottom}>
            <Pressable onPress={onLogout} style={styles.logoutButton}>
              <MaterialCommunityIcons
                name="logout"
                size={19}
                color={colors.muted}
              />
              <Text style={styles.logoutText}>登出</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  return (
    <Modal
      visible={Boolean(mode)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>
            {mode === "create" ? "建立空白共同帳本" : "加入共同帳本"}
          </Text>
          <Text style={styles.modalDescription}>
            {mode === "create"
              ? "這個帳本只會建立名稱與你這位管理員，不會建立任何交易、預算或固定收支；必要分類與支付方式會提供可選的預設項目。"
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TransactionModal({
  visible,
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
    splitType: "equal" | "custom" | "amount";
    splits: { userId: number; shareAmount: number }[];
  }) => void;
}) {
  const [amountText, setAmountText] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [payerId, setPayerId] = useState(String(user.id));
  const [dateText, setDateText] = useState(dateKey(new Date()));
  const [note, setNote] = useState("");
  const [splitType, setSplitType] = useState<"equal" | "custom" | "amount">(
    "equal"
  );
  const [splitValues, setSplitValues] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      setAmountText("");
      setType("expense");
      setCategoryId("");
      setPaymentId("");
      setPayerId(String(user.id));
      setDateText(dateKey(new Date()));
      setNote("");
      setSplitType("equal");
      setSplitValues({});
      setLocalError("");
    }
  }, [visible, user.id]);
  const availableCategories = categories.filter(item => item.type === type);
  const selectedCategories =
    categoryId || String(availableCategories[0]?.id || "");
  const selectedPayment = paymentId || String(paymentMethods[0]?.id || "");
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
      } else {
        splits = members
          .map(member => ({
            userId: member.user.id,
            shareAmount: Number(splitValues[member.user.id] || 0),
          }))
          .filter(item => item.shareAmount > 0);
        if (
          splits.reduce((sum, item) => sum + item.shareAmount, 0) !== amount
        ) {
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView style={styles.modalScroll}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>新增收支記錄</Text>
            <Text style={styles.modalDescription}>
              金額、分類、日期、付款人、支付方式、備註與分攤方式都會保存。
            </Text>
            {paymentMethods.length === 0 && (
              <View style={styles.setupNotice}>
                <MaterialCommunityIcons
                  name="credit-card-outline"
                  size={19}
                  color={colors.rose}
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
              <OptionScroller
                items={availableCategories.map(item => ({
                  id: item.id,
                  label: `${item.icon} ${item.name}`,
                }))}
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
                items={paymentMethods.map(item => ({
                  id: item.id,
                  label: `${item.icon} ${item.name}`,
                }))}
                value={Number(selectedPayment)}
                onChange={value => setPaymentId(String(value))}
              />
            </Field>
            <Field label="日期">
              <TextInput
                value={dateText}
                onChangeText={setDateText}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#B9A69E"
                style={styles.input}
              />
            </Field>
            <Field label="分攤方式">
              {type === "income" ? (
                <Text style={styles.rowSubtitle}>收入不需要分攤。</Text>
              ) : (
                <>
                  <View style={styles.segmentRow}>
                    {(["equal", "custom", "amount"] as const).map(item => (
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
                              : "直接金額"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {splitType !== "equal" &&
                    members.map(member => (
                      <View key={member.user.id} style={styles.splitInputRow}>
                        <Text style={styles.rowTitle}>
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

function BudgetModal({
  visible,
  categories,
  currentMonth: month,
  ledgerId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  categories: Category[];
  currentMonth: string;
  ledgerId: number;
  onClose: () => void;
  onSubmit: (input: {
    ledgerId: number;
    categoryId: number;
    amount: number;
    month: string;
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState("0");
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      setCategoryId("0");
      setAmount("");
      setLocalError("");
    }
  }, [visible]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>設定預算</Text>
          <Text style={styles.modalDescription}>
            設定本月總預算或指定分類預算；超支時會顯示警示。
          </Text>
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
            value={Number(categoryId)}
            onChange={value => setCategoryId(String(value))}
          />
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="預算金額"
            placeholderTextColor="#B9A69E"
            style={styles.input}
          />
          {!!localError && <Text style={styles.errorText}>{localError}</Text>}
          <Pressable
            onPress={() => {
              const value = Number(amount);
              if (!Number.isInteger(value) || value <= 0) {
                setLocalError("請輸入正整數預算。");
                return;
              }
              onSubmit({
                ledgerId,
                categoryId: Number(categoryId),
                amount: value,
                month,
              });
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>儲存預算</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.modalCancel}>
            <Text style={styles.modalCancelText}>取消</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RecurringModal({
  visible,
  categories,
  paymentMethods,
  ledgerId,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  ledgerId: number;
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
      setTitle("");
      setAmount("");
      setType("expense");
      setCategoryId("");
      setPaymentId("");
      setFrequency("monthly");
      setDay("1");
      setLocalError("");
    }
  }, [visible]);
  const filtered = categories.filter(item => item.type === type);
  const selectedCategory = categoryId || String(filtered[0]?.id || "");
  const selectedPayment = paymentId || String(paymentMethods[0]?.id || "");
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <ScrollView style={styles.modalScroll}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>新增固定收支</Text>
            <Text style={styles.modalDescription}>
              每次開啟帳本時會以固定鍵檢查並補入當期記錄，不會重複建立。
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
            </Field>
            <Field label="支付方式">
              <OptionScroller
                items={paymentMethods.map(item => ({
                  id: item.id,
                  label: `${item.icon} ${item.name}`,
                }))}
                value={Number(selectedPayment)}
                onChange={value => setPaymentId(String(value))}
              />
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
            <Pressable
              onPress={() => {
                const parsedAmount = Number(amount);
                const parsedDay = Number(day);
                if (
                  !title.trim() ||
                  !Number.isInteger(parsedAmount) ||
                  parsedAmount <= 0 ||
                  !selectedCategory ||
                  !selectedPayment ||
                  parsedDay < 1 ||
                  parsedDay > 31
                ) {
                  setLocalError("請完整填寫名稱、金額、分類、支付方式與日期。");
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
              <Text style={styles.primaryButtonText}>儲存固定收支</Text>
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
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [parent, setParent] = useState("0");
  const [icon, setIcon] = useState(mode === "category" ? "◌" : "💳");
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    if (visible) {
      setName("");
      setType("expense");
      setParent("0");
      setIcon(mode === "category" ? "◌" : "💳");
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
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
          <TextInput
            value={icon}
            onChangeText={setIcon}
            placeholder="圖示"
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
                      label: `${item.icon} ${item.name}`,
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
                icon: icon.trim() || (mode === "category" ? "◌" : "💳"),
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  loadingText: { marginTop: 12, color: colors.muted, fontSize: 13 },
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
    backgroundColor: colors.roseSoft,
  },
  brandTitle: {
    marginTop: 13,
    color: colors.ink,
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
    color: colors.ink,
    fontSize: 31,
    fontWeight: "700",
    lineHeight: 42,
  },
  loginDescription: {
    marginTop: 14,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  formCard: {
    marginTop: 34,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  formTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  formBody: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 21 },
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
    color: colors.muted,
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ledgerChipActive: {
    borderColor: colors.roseSoft,
    backgroundColor: colors.roseSoft,
  },
  ledgerChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  ledgerChipTextActive: {
    color: colors.rose,
    fontWeight: "800",
  },
  sectionIntro: { marginBottom: 20 },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  sectionTitle: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 27,
    fontWeight: "700",
  },
  sectionBody: {
    marginTop: 8,
    color: colors.muted,
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
  headerSafe: { backgroundColor: colors.surface },
  appHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  headerTitleWrap: { flex: 1, marginLeft: 8 },
  headerTitle: { color: colors.ink, fontSize: 21, fontWeight: "700" },
  headerCaption: { marginTop: 2, color: colors.muted, fontSize: 11 },
  headerAddButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.rose,
  },
  headerSpacer: { width: 44 },
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
    backgroundColor: colors.roseSoft,
  },
  emptyTitle: {
    marginTop: 25,
    color: colors.ink,
    fontSize: 28,
    fontWeight: "700",
  },
  emptyDescription: {
    maxWidth: 330,
    marginTop: 12,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
  },
  card: {
    marginBottom: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  heroCard: {
    marginBottom: 14,
    padding: 24,
    borderRadius: 25,
    backgroundColor: colors.burgundy,
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
    backgroundColor: colors.rose,
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  inviteBadge: {
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: colors.roseSoft,
  },
  inviteBadgeLabel: { color: colors.muted, fontSize: 10 },
  inviteBadgeValue: {
    marginTop: 3,
    color: colors.rose,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  statRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  statIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
    borderRadius: 11,
    backgroundColor: colors.roseSoft,
  },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: {
    marginTop: 7,
    color: colors.ink,
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
    backgroundColor: colors.roseSoft,
  },
  balanceLabel: { color: colors.muted, fontSize: 12 },
  balanceValue: {
    marginTop: 7,
    color: colors.ink,
    fontSize: 23,
    fontWeight: "700",
  },
  trendText: {
    maxWidth: 130,
    color: colors.rose,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "right",
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  cardHint: { color: colors.muted, fontSize: 11 },
  memberPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#F5ECE7",
  },
  avatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.roseSoft,
  },
  avatarText: { color: colors.rose, fontWeight: "800" },
  memberPaymentName: { flex: 1 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  rowSubtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  rowAmount: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  incomeText: { color: colors.sage },
  insightCard: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  insightText: { flex: 1 },
  insightTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  insightBody: {
    marginTop: 5,
    color: colors.muted,
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
    backgroundColor: "#FFF5F0",
  },
  settlementIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFE3DB",
  },
  settlementText: { flex: 1 },
  settlementTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  settlementBody: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: colors.rose,
  },
  smallButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
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
  progressHint: { marginTop: 8, color: colors.muted, fontSize: 11 },
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
    backgroundColor: colors.roseSoft,
  },
  outlineIconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3C3C4",
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
  dashedButtonText: { color: colors.rose, fontSize: 13, fontWeight: "700" },
  emptyInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
  },
  emptyInlineText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  inviteCodeLarge: {
    marginVertical: 9,
    color: colors.rose,
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
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
  },
  rolePill: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.roseSoft,
  },
  rolePillText: { color: colors.rose, fontSize: 10, fontWeight: "700" },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 7,
  },
  weekLabel: {
    width: "14.28%",
    color: colors.muted,
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
  calendarSelected: { backgroundColor: colors.roseSoft },
  calendarDay: { color: colors.ink, fontSize: 13 },
  calendarDaySelected: { color: colors.rose, fontWeight: "800" },
  calendarDot: { width: 5, height: 5, marginTop: 4, borderRadius: 3 },
  drawerBackdrop: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(58,47,43,0.26)",
  },
  drawerDismiss: { flex: 1 },
  drawer: {
    width: 286,
    paddingHorizontal: 20,
    paddingTop: 60,
    backgroundColor: colors.surface,
    shadowColor: "#3A2F2B",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 12,
  },
  drawerBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallMark: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.roseSoft,
  },
  drawerTitle: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  drawerCaption: {
    marginTop: 5,
    marginLeft: 46,
    color: "#B69E94",
    fontSize: 9,
    letterSpacing: 2,
  },
  drawerDivider: {
    height: 1,
    marginVertical: 26,
    backgroundColor: colors.border,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 14,
  },
  drawerItemActive: { backgroundColor: colors.roseSoft },
  drawerItemText: { color: colors.muted, fontSize: 14 },
  drawerItemTextActive: { color: colors.rose, fontWeight: "700" },
  drawerBottom: { flex: 1, justifyContent: "flex-end", paddingBottom: 24 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 13,
  },
  logoutText: { color: colors.muted, fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(58,47,43,0.28)",
  },
  modalDismiss: { flex: 1 },
  modalScroll: { maxHeight: "90%" },
  modalCard: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E4D6CF",
  },
  modalTitle: {
    marginTop: 22,
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
  },
  modalDescription: {
    marginTop: 8,
    marginBottom: 18,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    minHeight: 52,
    marginBottom: 14,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#FFFAF7",
    color: colors.ink,
    fontSize: 15,
  },
  textarea: { minHeight: 80, paddingTop: 14, textAlignVertical: "top" },
  field: { marginBottom: 14 },
  fieldLabel: {
    marginBottom: 8,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  optionScroller: { gap: 8, paddingBottom: 4 },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  optionChipActive: {
    borderColor: colors.rose,
    backgroundColor: colors.roseSoft,
  },
  optionChipText: { color: colors.muted, fontSize: 12 },
  optionChipTextActive: { color: colors.rose, fontWeight: "700" },
  segmentRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  segmentActive: { borderColor: colors.rose, backgroundColor: colors.roseSoft },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  segmentTextActive: { color: colors.rose },
  miniSegment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
  },
  miniSegmentActive: {
    borderColor: colors.rose,
    backgroundColor: colors.roseSoft,
  },
  miniSegmentText: { color: colors.muted, fontSize: 11 },
  miniSegmentTextActive: { color: colors.rose, fontWeight: "700" },
  splitInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  splitInput: {
    width: 130,
    minHeight: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: "#FFFAF7",
    color: colors.ink,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.rose,
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
    borderColor: "#E3C3C4",
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.rose, fontSize: 15, fontWeight: "700" },
  setupNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
    padding: 12,
    borderRadius: 13,
    backgroundColor: colors.roseSoft,
  },
  setupNoticeCopy: {
    flex: 1,
  },
  setupNoticeTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  setupNoticeBody: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  setupNoticeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  setupNoticeButtonText: {
    color: colors.rose,
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
  modalCancelText: { color: colors.muted, fontSize: 14 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.58 },
});
