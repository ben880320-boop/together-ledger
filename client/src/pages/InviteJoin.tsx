import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Heart, LoaderCircle, Smartphone, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

function inviteCodeFromSearch() {
  return new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase() ?? "";
}

function androidAppIntent(code: string) {
  const fallback = new URL(window.location.href);
  fallback.searchParams.set("web", "1");
  return `intent://join?code=${encodeURIComponent(code)}#Intent;scheme=togetherledger;package=com.togetherledger.app;S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end`;
}

export default function InviteJoin() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const code = useMemo(inviteCodeFromSearch, []);
  const utils = trpc.useUtils();
  const [error, setError] = useState("");
  const join = trpc.ledger.join.useMutation({
    onSuccess: async () => {
      await utils.ledger.list.invalidate();
      setLocation("/app");
    },
    onError: mutationError => setError(mutationError.message || "暫時無法加入帳本，請稍後重試。"),
  });

  useEffect(() => {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isWebFallback = new URLSearchParams(window.location.search).get("web") === "1";
    if (!code || !isAndroid || isWebFallback) return;
    const timer = window.setTimeout(() => { window.location.href = androidAppIntent(code); }, 120);
    return () => window.clearTimeout(timer);
  }, [code]);

  const openApp = () => {
    window.location.href = androidAppIntent(code);
  };

  const joinOrSignIn = () => {
    if (!user) {
      setLocation(`/login?invite=${encodeURIComponent(code)}`);
      return;
    }
    join.mutate({ inviteCode: code });
  };

  if (!code) return <main className="flex min-h-screen items-center justify-center bg-[#F7F4F1] p-5"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-bold">邀請連結不完整</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">請回到邀請者分享的連結或 QR Code 後重新開啟。</p><Button className="mt-6 rounded-xl" onClick={() => setLocation("/")}>返回首頁</Button></section></main>;

  return <main className="flex min-h-screen items-center justify-center bg-[#F7F4F1] p-5"><section className="w-full max-w-md rounded-[30px] border border-[#EBDDD7] bg-white p-7 text-center shadow-[0_18px_48px_rgba(91,65,66,.12)]"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#F6E4E4] text-[#B56C78]"><Heart size={29} fill="currentColor" /></span><p className="mt-6 text-xs font-semibold tracking-[.16em] text-[#A17D76]">TOGETHER LEDGER INVITE</p><h1 className="mt-3 text-2xl font-bold text-[#443231]">加入共同帳本</h1><p className="mt-3 text-sm leading-7 text-[#8D7770]">邀請碼 <b className="font-mono tracking-[.16em] text-[#A35F6D]">{code}</b>。登入後即可在網頁、PWA 與 Android App 同步查看帳本。</p>{error && <p role="alert" className="mt-5 rounded-xl bg-[#FCE8E6] px-3 py-2 text-sm text-[#A3464E]">{error}</p>}<div className="mt-7 grid gap-3"><Button type="button" disabled={loading || join.isPending} onClick={joinOrSignIn} className="h-12 rounded-xl bg-[#B56C78] text-white hover:bg-[#A35B68]">{join.isPending ? <LoaderCircle className="mr-2 animate-spin" size={17} /> : <Users className="mr-2" size={17} />}{loading ? "正在確認登入…" : user ? "加入這個帳本" : "登入後加入帳本"}</Button><Button type="button" variant="outline" onClick={openApp} className="h-11 rounded-xl"><Smartphone className="mr-2" size={17} />改用 Android App 開啟</Button></div><p className="mt-5 text-xs leading-5 text-muted-foreground">未安裝 App 也能在此網頁加入；帳本存取權仍由伺服器驗證。</p></section></main>;
}
