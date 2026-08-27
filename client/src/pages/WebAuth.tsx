import { useAuth } from "@/_core/hooks/useAuth";
import { ReleaseFooter } from "@/components/ReleaseFooter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COOKIE_NAME } from "@/const";
import {
  getPersistedVerifiedFirebaseIdToken,
  firebaseSignOut,
  messageOfFirebaseError,
  registerFirebaseEmail,
  requestFirebasePasswordReset,
  resendFirebaseVerification,
  signInFirebaseEmail,
} from "@/lib/firebaseAuth";
import { trpc } from "@/lib/trpc";
import { Heart, KeyRound, LoaderCircle, Mail, ShieldAlert, UserRound } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Mode = "login" | "register";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "暫時無法完成操作，請稍後再試。";
}

export default function WebAuth() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [authDialog, setAuthDialog] = useState<"reset" | "resend" | null>(null);
  const [dialogEmail, setDialogEmail] = useState("");
  const [dialogPassword, setDialogPassword] = useState("");
  const [resendStep, setResendStep] = useState<"email" | "credential">("email");
  const [registrationNoticeOpen, setRegistrationNoticeOpen] = useState(false);
  const [registrationNoticeRead, setRegistrationNoticeRead] = useState(false);
  const [firebaseBusy, setFirebaseBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const firebaseRestoreAttempted = useRef(false);
  const inviteCode = new URLSearchParams(window.location.search).get("invite")?.trim().toUpperCase();
  const emailActionComplete = new URLSearchParams(window.location.search).get("emailAction") === "complete";
  const sessionRevoked = new URLSearchParams(window.location.search).get("reason") === "session-revoked";
  const [emailActionNoticeOpen, setEmailActionNoticeOpen] = useState(() => emailActionComplete);
  const afterAuthPath = inviteCode ? `/invite?code=${encodeURIComponent(inviteCode)}` : "/app";

  useEffect(() => {
    if (!loading && user) setLocation(afterAuthPath);
  }, [afterAuthPath, loading, setLocation, user]);

  useEffect(() => {
    if (!emailActionComplete) return;
    setMode("login");
    setEmailActionNoticeOpen(true);
    const query = inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : "";
    window.history.replaceState(null, "", `/login${query}`);
  }, [emailActionComplete, inviteCode]);

  useEffect(() => {
    if (!sessionRevoked) return;
    // This is reached only through the server's sessionVersion-mismatch
    // contract. It deliberately clears the Firebase refresh session, unlike a
    // normal token expiry or temporary network failure.
    firebaseRestoreAttempted.current = true;
    setMode("login");
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {}
    void firebaseSignOut().catch(() => undefined);
  }, [sessionRevoked]);

  const establishSession = async (token: string) => {
    setCheckingSession(true);
    try {
      // The server response also sets an HTTP-only Cookie. Retain this header
      // fallback only for embedded browsers that do not return that Cookie.
      sessionStorage.setItem("manus-cookie", `${COOKIE_NAME}=${token}`);
    } catch {
      // Private/mobile contexts can restrict Web Storage. Cookie authentication
      // remains available without this compatibility fallback.
    }

    try {
      await utils.auth.me.invalidate();
      const session = await utils.auth.me.fetch();
      if (!session?.user) {
        toast.error("登入狀態尚未建立，請確認瀏覽器允許本站的 Cookie 後再試一次。", { duration: 7_000 });
        return;
      }
      setLocation(afterAuthPath);
    } catch {
      toast.error("登入狀態確認失敗，請稍後再試一次。", { duration: 7_000 });
    } finally {
      setCheckingSession(false);
    }
  };

  const legacyLogin = trpc.auth.login.useMutation({
    onSuccess: result => establishSession(result.token),
    onError: error => toast.error(messageOf(error), { duration: 7_000 }),
  });
  const exchangeFirebaseToken = trpc.auth.exchangeFirebaseToken.useMutation({
    onError: error => toast.error(messageOf(error), { duration: 7_000 }),
  });

  const completeFirebaseSignIn = async (idToken: string, remember = false) => {
    const result = await exchangeFirebaseToken.mutateAsync({ idToken, rememberDevice: remember });
    await establishSession(result.token);
  };

  useEffect(() => {
    if (loading || user || sessionRevoked || mode !== "login" || firebaseRestoreAttempted.current) return;
    firebaseRestoreAttempted.current = true;
    void (async () => {
      setCheckingSession(true);
      try {
        const idToken = await getPersistedVerifiedFirebaseIdToken();
        if (idToken) await completeFirebaseSignIn(idToken, true);
      } catch {
        // No visible error is needed when a remembered device has expired;
        // the normal login form remains the safe retry route.
      } finally {
        setCheckingSession(false);
      }
    })();
  }, [loading, mode, sessionRevoked, user]);

  const pending = firebaseBusy || legacyLogin.isPending || exchangeFirebaseToken.isPending || checkingSession;
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFirebaseBusy(true);
    try {
      if (mode === "register") {
        if (!registrationNoticeRead) {
          setRegistrationNoticeOpen(true);
          return;
        }
        if (!name.trim()) {
          toast.error("請輸入顯示暱稱。", { duration: 5_000 });
          return;
        }
        await registerFirebaseEmail({ name, email, password });
        toast.success("共帳驗證信已寄出。請完成信箱驗證後，再回來登入；若數分鐘內未收到，也請檢查收件匣與垃圾郵件匣。", { duration: 9_000 });
        setMode("login");
        setPassword("");
        return;
      }
      const idToken = await signInFirebaseEmail(email, password, rememberDevice);
      await completeFirebaseSignIn(idToken, rememberDevice);
    } catch (error) {
      toast.error(messageOfFirebaseError(error), { duration: 7_000 });
    } finally {
      setFirebaseBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!dialogEmail.trim()) {
      toast.message("請輸入註冊電子信箱。為保護帳號安全，系統不會顯示帳號是否存在。", { duration: 7_000 });
      return;
    }
    setFirebaseBusy(true);
    try {
      await requestFirebasePasswordReset(dialogEmail);
      toast.success("若此電子信箱已啟用共帳登入，重設密碼信已寄出。請查看收件匣與垃圾郵件匣。", { duration: 9_000 });
      setAuthDialog(null);
    } catch (error) {
      const message = messageOfFirebaseError(error);
      if (message.includes("網路") || message.includes("尚未完成設定")) {
        toast.error(message, { duration: 7_000 });
      } else {
        toast.success("若此電子信箱已啟用共帳登入，重設密碼信已寄出。請查看收件匣與垃圾郵件匣。", { duration: 9_000 });
      }
    } finally {
      setFirebaseBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendStep === "email") {
      if (!dialogEmail.trim()) {
        toast.message("請輸入註冊電子信箱後繼續。", { duration: 6_000 });
        return;
      }
      setResendStep("credential");
      return;
    }
    if (!dialogPassword) {
      toast.message("請輸入目前密碼，以安全地重新驗證後寄送驗證信。", { duration: 6_000 });
      return;
    }
    setFirebaseBusy(true);
    try {
      await resendFirebaseVerification(dialogEmail, dialogPassword);
      toast.success("若帳號尚未驗證，共帳驗證信已重新寄送。請查看收件匣與垃圾郵件匣，完成驗證後再登入。", { duration: 9_000 });
      setAuthDialog(null);
      setResendStep("email");
      setDialogPassword("");
    } catch (error) {
      toast.error(messageOfFirebaseError(error), { duration: 7_000 });
    } finally {
      setFirebaseBusy(false);
    }
  };

  const handleLegacyLogin = () => {
    legacyLogin.mutate({ email: email.trim(), password });
  };

  return (
    <div className="web-auth-shell min-h-screen">
      <main className="mx-auto flex min-h-[calc(100vh-104px)] w-full max-w-6xl items-center px-5 py-10 md:px-8">
        <div className="web-auth-panel grid w-full overflow-hidden rounded-[32px] border lg:grid-cols-[1.03fr_0.97fr]">
          <section className="web-auth-hero relative overflow-hidden px-7 py-10 sm:px-10 lg:py-16">
            <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full border-[30px] border-white/5" />
            <div className="absolute -bottom-20 right-0 h-56 w-56 rounded-full bg-[color-mix(in_srgb,var(--scene-halo)_28%,transparent)] blur-2xl" />
            <div className="relative">
              <button type="button" onClick={() => setLocation("/")} className="flex items-center gap-3 text-left">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--scene-hero-foreground)_88%,transparent)] text-primary"><Heart size={21} fill="currentColor" /></span>
                <span><span className="block font-serif text-xl font-semibold">共帳</span><span className="block text-[10px] tracking-[0.22em] text-[color-mix(in_srgb,var(--scene-hero-foreground)_76%,transparent)]">TOGETHER LEDGER</span></span>
              </button>
              <p className="mt-16 max-w-md text-xs font-semibold tracking-[0.2em] text-[color-mix(in_srgb,var(--scene-hero-foreground)_78%,transparent)]">共用帳本，安心同步</p>
              <h1 className="mt-4 max-w-md font-serif text-4xl leading-tight sm:text-5xl">用同一個帳號，<br />接續你們的每一筆日常。</h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-[color-mix(in_srgb,var(--scene-hero-foreground)_84%,transparent)]">Android App 與網頁版會使用相同帳本資料。登入後即可建立共同帳本、以邀請碼加入，並查看真實的收支與結算資訊。</p>
              <div className="web-auth-features mt-12 grid max-w-md grid-cols-3 gap-3 text-center text-xs text-[color-mix(in_srgb,var(--scene-hero-foreground)_88%,transparent)]">
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">共同帳本</div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">即時收支</div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">安全登入</div>
              </div>
            </div>
          </section>
          <section className="web-auth-form px-6 py-9 sm:px-10 sm:py-12">
            <div className="mx-auto max-w-sm">
              <div className="flex rounded-xl bg-muted p-1">
                <button type="button" onClick={() => setMode("login")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>登入</button>
                <button type="button" onClick={() => setMode("register")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>註冊帳號</button>
              </div>
              <div className="mt-8">
                <h2 className="text-2xl font-bold tracking-tight">{mode === "login" ? "歡迎回來" : "建立你的帳號"}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "login" ? "使用已驗證的電子信箱與密碼安全登入。" : "註冊後先驗證電子信箱，再建立帳本或輸入邀請碼加入對方的帳本。"}</p>
              </div>
              {sessionRevoked && <div role="alert" className="mt-5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-foreground"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="font-semibold">此裝置的登入已被撤銷</p><p className="mt-1 leading-5 text-muted-foreground">為保護帳本安全，管理員已要求此裝置重新驗證。帳本資料未被刪除，請重新輸入已驗證電子信箱與密碼登入。</p></div></div></div>}
              {emailActionNoticeOpen && <div role="status" className="mt-5 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground"><p className="font-semibold">電子郵件操作已完成</p><p className="mt-1 leading-5 text-muted-foreground">若剛重設密碼，請以新密碼登入；若剛完成信箱驗證，現在可以安全登入。若尚未生效，請重新開啟驗證信中的連結或稍後再試。</p><button type="button" onClick={() => setEmailActionNoticeOpen(false)} className="mt-2 text-xs font-semibold text-primary underline-offset-4 hover:underline">關閉說明</button></div>}
              <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
                {mode === "register" && <div className="space-y-2"><Label htmlFor="web-auth-name">顯示暱稱</Label><div className="relative"><UserRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="web-auth-name" value={name} onChange={event => setName(event.target.value)} className="h-10 border-input pl-9" maxLength={64} autoComplete="name" /></div></div>}
                <div className="space-y-2"><Label htmlFor="web-auth-email">電子信箱</Label><div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="web-auth-email" value={email} onChange={event => setEmail(event.target.value)} className="h-10 border-input pl-9" type="email" autoComplete="email" required /></div></div>
                <div className="space-y-2"><Label htmlFor="web-auth-password">密碼</Label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="web-auth-password" value={password} onChange={event => setPassword(event.target.value)} className="h-10 border-input pl-9" type="password" minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div><p className="text-xs text-muted-foreground">密碼長度至少 8 個字元。</p></div>
                {mode === "login" && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-muted/35 px-3 py-3 text-left"><input type="checkbox" checked={rememberDevice} onChange={event => setRememberDevice(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block text-sm font-semibold text-foreground">記住此裝置</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">僅限你自己的裝置。共帳不會保存密碼；未勾選時，關閉瀏覽器後需重新登入。</span></span></label>}
                <Button type="submit" disabled={pending} aria-busy={pending} className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_12px_24px_var(--scene-shadow)] hover:bg-primary/90">{pending && <LoaderCircle size={16} className="mr-2 animate-spin" />}{pending ? checkingSession ? "正在安全開啟帳本…" : "正在驗證帳號…" : mode === "login" ? "登入並開啟帳本" : "註冊並建立帳本"}</Button>
                {pending && <p className="text-center text-xs text-muted-foreground" role="status">登入完成後會同步你的共同帳本，請勿關閉此頁。</p>}
                {mode === "login" && <div className="flex flex-col gap-2 text-center text-sm sm:flex-row sm:justify-center"><button type="button" disabled={pending} onClick={() => { setDialogEmail(email); setAuthDialog("reset"); }} className="font-medium text-primary underline-offset-4 hover:underline">忘記密碼</button><span className="hidden text-muted-foreground sm:inline">·</span><button type="button" disabled={pending} onClick={() => { setDialogEmail(email); setDialogPassword(""); setResendStep("email"); setAuthDialog("resend"); }} className="font-medium text-primary underline-offset-4 hover:underline">重新寄送驗證信</button></div>}
                {mode === "login" && <p className="text-center text-xs leading-5 text-muted-foreground">忘記密碼與重寄驗證會先開啟安全視窗填寫註冊電子信箱；請查看收件匣與垃圾郵件匣。</p>}
                {mode === "login" && <p className="text-center text-xs leading-5 text-muted-foreground">尚未綁定信箱的舊帳戶可在過渡期內選擇下方連結完成遷移。</p>}
                {mode === "login" && <button type="button" disabled={pending} onClick={handleLegacyLogin} className="mx-auto block text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline">舊帳戶遷移登入（暫時保留）</button>}
              </form>
            </div>
          </section>
        </div>
      </main>
      <Dialog open={authDialog !== null} onOpenChange={open => { if (!open) { setAuthDialog(null); setResendStep("email"); setDialogPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{authDialog === "reset" ? "重設密碼" : "重新寄送驗證信"}</DialogTitle><DialogDescription>{authDialog === "reset" ? "輸入註冊電子信箱後，我們會寄送重設連結。為帳戶安全，結果不會透露此信箱是否已註冊。" : resendStep === "email" ? "先輸入註冊電子信箱，再進行下一步安全驗證。" : "請輸入目前密碼以重新驗證身分；此密碼只用於本次操作，不會被保存。"}</DialogDescription></DialogHeader>
          <div className="space-y-3"><Label htmlFor="auth-action-email">註冊電子信箱</Label><Input id="auth-action-email" type="email" autoComplete="email" value={dialogEmail} onChange={event => setDialogEmail(event.target.value)} autoFocus />{authDialog === "resend" && resendStep === "credential" && <><Label htmlFor="auth-action-password">目前密碼</Label><Input id="auth-action-password" type="password" autoComplete="current-password" value={dialogPassword} onChange={event => setDialogPassword(event.target.value)} /></>}</div>
          <DialogFooter><Button type="button" disabled={firebaseBusy} onClick={authDialog === "reset" ? handlePasswordReset : handleResendVerification}>{firebaseBusy && <LoaderCircle size={16} className="mr-2 animate-spin" />}{authDialog === "reset" ? "寄送重設信" : resendStep === "email" ? "下一步" : "重新寄送驗證信"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={registrationNoticeOpen} onOpenChange={open => {
        // Outside clicks and Escape are prevented below. Therefore a close event
        // here represents the visible × control, which is the deliberate read
        // acknowledgement required before Firebase registration can continue.
        if (!open) {
          setRegistrationNoticeRead(true);
          setRegistrationNoticeOpen(false);
        }
      }}>
        <DialogContent showCloseButton onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()} className="sm:max-w-md">
          <DialogHeader><DialogTitle>請先完成電子信箱驗證</DialogTitle><DialogDescription>為保護共同帳本資料，註冊後 24 小時內未完成電子信箱驗證的帳戶將被自動清理。尚未驗證的帳戶不能建立或加入帳本，因此不會影響既有帳本與交易。</DialogDescription></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">請閱讀後按右上角 × 關閉此提醒，再按一次「註冊並建立帳本」。驗證信可能出現在垃圾郵件匣。</p>
        </DialogContent>
      </Dialog>
      <ReleaseFooter />
    </div>
  );
}
