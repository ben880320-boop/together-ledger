import { useAuth } from "@/_core/hooks/useAuth";
import { ReleaseFooter } from "@/components/ReleaseFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COOKIE_NAME } from "@/const";
import { trpc } from "@/lib/trpc";
import { Heart, KeyRound, LoaderCircle, Mail, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
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
  const [formError, setFormError] = useState("");
  const [checkingSession, setCheckingSession] = useState(false);

  useEffect(() => {
    if (!loading && user) setLocation("/app");
  }, [loading, setLocation, user]);

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
        setFormError("登入狀態尚未建立，請確認瀏覽器允許本站的 Cookie 後再試一次。");
        return;
      }
      setLocation("/app");
    } catch {
      setFormError("登入狀態確認失敗，請稍後再試一次。");
    } finally {
      setCheckingSession(false);
    }
  };

  const login = trpc.auth.login.useMutation({
    onSuccess: result => establishSession(result.token),
    onError: error => setFormError(messageOf(error)),
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: result => establishSession(result.token),
    onError: error => setFormError(messageOf(error)),
  });

  const pending = login.isPending || register.isPending;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (mode === "register") {
      if (!name.trim()) {
        setFormError("請輸入顯示暱稱。");
        return;
      }
      register.mutate({ name: name.trim(), email: email.trim(), password });
      return;
    }
    login.mutate({ email: email.trim(), password });
  };

  return (
    <div className="web-auth-shell min-h-screen bg-[#F7F4F1] text-[#332925]">
      <main className="mx-auto flex min-h-[calc(100vh-104px)] w-full max-w-6xl items-center px-5 py-10 md:px-8">
        <div className="web-auth-panel grid w-full overflow-hidden rounded-[32px] border border-white bg-white/85 shadow-[0_24px_70px_rgba(86,58,50,0.13)] lg:grid-cols-[1.03fr_0.97fr]">
          <section className="web-auth-hero relative overflow-hidden bg-[#5B4142] px-7 py-10 text-white sm:px-10 lg:py-16">
            <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full border-[30px] border-white/5" />
            <div className="absolute -bottom-20 right-0 h-56 w-56 rounded-full bg-[#D99199]/20 blur-2xl" />
            <div className="relative">
              <button type="button" onClick={() => setLocation("/")} className="flex items-center gap-3 text-left">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3D5D8] text-[#A85C6D]"><Heart size={21} fill="currentColor" /></span>
                <span><span className="block font-serif text-xl font-semibold">共帳</span><span className="block text-[10px] tracking-[0.22em] text-[#E6CACC]">TOGETHER LEDGER</span></span>
              </button>
              <p className="mt-16 max-w-md text-xs font-semibold tracking-[0.2em] text-[#E7C9CB]">共用帳本，安心同步</p>
              <h1 className="mt-4 max-w-md font-serif text-4xl leading-tight sm:text-5xl">用同一個帳號，<br />接續你們的每一筆日常。</h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-[#EADADA]">Android App 與網頁版會使用相同帳本資料。登入後即可建立共同帳本、以邀請碼加入，並查看真實的收支與結算資訊。</p>
              <div className="web-auth-features mt-12 grid max-w-md grid-cols-3 gap-3 text-center text-xs text-[#F0DCDC]">
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">共同帳本</div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">即時收支</div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">安全登入</div>
              </div>
            </div>
          </section>
          <section className="web-auth-form px-6 py-9 sm:px-10 sm:py-12">
            <div className="mx-auto max-w-sm">
              <div className="flex rounded-xl bg-[#F8F1EE] p-1">
                <button type="button" onClick={() => { setMode("login"); setFormError(""); }} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-white text-[#9B5966] shadow-sm" : "text-[#9C857D]"}`}>登入</button>
                <button type="button" onClick={() => { setMode("register"); setFormError(""); }} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-white text-[#9B5966] shadow-sm" : "text-[#9C857D]"}`}>註冊帳號</button>
              </div>
              <div className="mt-8">
                <h2 className="text-2xl font-bold tracking-tight">{mode === "login" ? "歡迎回來" : "建立你的帳號"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#8D7870]">{mode === "login" ? "使用你在共帳 App 建立的電子信箱與密碼登入。" : "註冊後可直接建立帳本或輸入邀請碼加入對方的帳本。"}</p>
              </div>
              <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
                {mode === "register" && <div className="space-y-2"><Label htmlFor="web-auth-name">顯示暱稱</Label><div className="relative"><UserRound className="absolute left-3 top-3 h-4 w-4 text-[#AD9289]" /><Input id="web-auth-name" value={name} onChange={event => setName(event.target.value)} className="h-10 border-[#E3D3CC] pl-9" maxLength={64} autoComplete="name" /></div></div>}
                <div className="space-y-2"><Label htmlFor="web-auth-email">電子信箱</Label><div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-[#AD9289]" /><Input id="web-auth-email" value={email} onChange={event => setEmail(event.target.value)} className="h-10 border-[#E3D3CC] pl-9" type="email" autoComplete="email" required /></div></div>
                <div className="space-y-2"><Label htmlFor="web-auth-password">密碼</Label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-[#AD9289]" /><Input id="web-auth-password" value={password} onChange={event => setPassword(event.target.value)} className="h-10 border-[#E3D3CC] pl-9" type="password" minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div><p className="text-xs text-[#A0877E]">密碼長度至少 8 個字元。</p></div>
                {formError && <p role="alert" className="rounded-xl bg-[#FDF0EE] px-3 py-2.5 text-sm leading-6 text-[#A05355]">{formError}</p>}
                <Button type="submit" disabled={pending} aria-busy={pending} className="h-11 w-full rounded-xl bg-[#B56C78] font-semibold text-white shadow-[0_12px_24px_rgba(181,108,120,0.22)] hover:bg-[#A45C69]">{pending && <LoaderCircle size={16} className="mr-2 animate-spin" />}{pending ? checkingSession ? "正在安全開啟帳本…" : "正在驗證帳號…" : mode === "login" ? "登入並開啟帳本" : "註冊並建立帳本"}</Button>
                {pending && <p className="text-center text-xs text-[#9C857D]" role="status">登入完成後會同步你的共同帳本，請勿關閉此頁。</p>}
              </form>
            </div>
          </section>
        </div>
      </main>
      <ReleaseFooter />
    </div>
  );
}
