import { getApp, getApps, initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updateProfile,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const GOOGLE_REDIRECT_INTENT_KEY = "together-ledger:google-redirect-intent";

export type GoogleFirebaseSignInResult =
  | { kind: "completed"; idToken: string }
  | { kind: "redirecting" };

function assertFirebaseConfig() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("電子郵件登入尚未完成設定，請稍後再試或使用既有帳密登入。");
  }
}

function firebaseAuth() {
  assertFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  // Firebase 會依此 BCP 47 語言標籤選擇驗證與密碼重設信的在地化範本。
  auth.languageCode = "zh-TW";
  return auth;
}

function actionCodeSettings() {
  return {
    // Firebase 的安全驗證頁完成後回到既有登入頁；不能指向未註冊的路由。
    url: `${window.location.origin}/login?emailAction=complete`,
    handleCodeInApp: false,
  };
}

async function configureFirebasePersistence(rememberDevice: boolean) {
  const auth = firebaseAuth();
  // Firebase 只會保存可撤銷的 refresh token；共帳不會保存或回填明碼密碼。
  await setPersistence(auth, rememberDevice ? browserLocalPersistence : browserSessionPersistence);
  return auth;
}

export function messageOfFirebaseError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "電子信箱或密碼錯誤。";
  if (code === "auth/email-already-in-use") return "此電子信箱已註冊，請直接登入或使用忘記密碼。";
  if (code === "auth/weak-password") return "密碼強度不足，請使用至少 8 個字元。";
  if (code === "auth/too-many-requests") return "嘗試次數過多，請稍後再試或使用忘記密碼。";
  if (code === "auth/network-request-failed") return "網路連線失敗，請確認連線後重試。";
  if (code === "auth/account-exists-with-different-credential") return "此 Google 電子信箱已用其他登入方式建立 Firebase 身分。請先用原登入方式登入，再從個人設定完成帳戶連結。";
  if (code === "auth/popup-blocked") return "Google 登入視窗被瀏覽器封鎖。請允許本站開啟視窗後重試。";
  if (code === "auth/popup-closed-by-user") return "已取消 Google 身分驗證。";
  if (code === "auth/redirect-cancelled-by-user") return "已取消 Google 身分驗證。";
  if (code === "auth/unauthorized-domain") return "此網站網域尚未授權 Google 登入，請確認使用正式共帳網址後重試。";
  if (code === "auth/operation-not-allowed") return "Google 登入尚未啟用，請稍後再試。";
  if (code === "auth/requires-recent-login") return "為保護帳號安全，請重新驗證 Google 或 Firebase 身分後再試一次。";
  return error instanceof Error ? error.message : "電子郵件驗證暫時無法完成，請稍後再試。";
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  // On shared devices an account picker prevents an unintended silent identity.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function prefersGoogleRedirect() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const isMobileBrowser = /Android|iP(?:hone|ad|od)|Mobile/i.test(navigator.userAgent);
  const isStandalonePwa = window.matchMedia?.("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return isMobileBrowser || isStandalonePwa;
}

function persistGoogleRedirectIntent(rememberDevice: boolean) {
  try {
    sessionStorage.setItem(GOOGLE_REDIRECT_INTENT_KEY, rememberDevice ? "remember" : "session");
  } catch {
    // Firebase redirect persistence remains authoritative. If private browsing
    // blocks this marker, returning safely as session-only is preferred.
  }
}

function consumeGoogleRedirectIntent() {
  try {
    const value = sessionStorage.getItem(GOOGLE_REDIRECT_INTENT_KEY);
    sessionStorage.removeItem(GOOGLE_REDIRECT_INTENT_KEY);
    return value === "remember";
  } catch {
    return false;
  }
}

export function hasPendingGoogleRedirectSignIn() {
  try {
    return sessionStorage.getItem(GOOGLE_REDIRECT_INTENT_KEY) !== null;
  } catch {
    return false;
  }
}

async function finishGoogleCredential(user: User) {
  if (!user.emailVerified) {
    await signOut(firebaseAuth());
    throw new Error("Google 身分未提供可驗證的電子信箱，無法登入共帳。");
  }
  return user.getIdToken(true);
}

async function startGoogleRedirect(auth: ReturnType<typeof firebaseAuth>, rememberDevice: boolean) {
  // Keep only a persistence preference. Tokens, profile data, invite values,
  // and sensitive-action continuations are never written to browser storage.
  persistGoogleRedirectIntent(rememberDevice);
  await signInWithRedirect(auth, googleProvider());
  return { kind: "redirecting" } as const;
}

export function isGoogleFirebaseUser(user: User | null | undefined) {
  return Boolean(user?.providerData.some(provider => provider.providerId === "google.com"));
}

function shouldClearPersistedFirebaseIdentity(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return [
    "auth/user-disabled",
    "auth/user-not-found",
    "auth/user-token-expired",
    "auth/user-token-revoked",
    "auth/invalid-user-token",
  ].includes(code);
}

export async function registerFirebaseEmail(input: { email: string; password: string; name: string }) {
  // 註冊後會立即登出，避免尚未驗證的帳戶殘留在裝置上。
  const auth = await configureFirebasePersistence(false);
  const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  await updateProfile(credential.user, { displayName: input.name.trim() });
  await sendEmailVerification(credential.user, actionCodeSettings());
  await signOut(auth);
}

export async function signInFirebaseEmail(email: string, password: string, rememberDevice: boolean) {
  const auth = await configureFirebasePersistence(rememberDevice);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user, actionCodeSettings());
    await signOut(auth);
    throw new Error("此電子信箱尚未驗證；驗證信已重新寄送。請完成驗證後再登入。");
  }
  return credential.user.getIdToken(true);
}

/** Returns only a Firebase ID token; no Google token is sent to our server. */
export async function signInFirebaseGoogle(rememberDevice: boolean): Promise<GoogleFirebaseSignInResult> {
  const auth = await configureFirebasePersistence(rememberDevice);
  if (prefersGoogleRedirect()) return startGoogleRedirect(auth, rememberDevice);
  try {
    const credential = await signInWithPopup(auth, googleProvider());
    return { kind: "completed", idToken: await finishGoogleCredential(credential.user) };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      return startGoogleRedirect(auth, rememberDevice);
    }
    throw error;
  }
}

/** Restores a deliberate Google login redirect once, without redirect loops. */
export async function getRedirectedFirebaseGoogleSignIn(): Promise<{ idToken: string; rememberDevice: boolean } | null> {
  if (!hasPendingGoogleRedirectSignIn()) return null;
  const rememberDevice = consumeGoogleRedirectIntent();
  const credential = await getRedirectResult(firebaseAuth());
  if (!credential) return null;
  return { idToken: await finishGoogleCredential(credential.user), rememberDevice };
}

export async function resendFirebaseVerification(email: string, password: string) {
  const auth = await configureFirebasePersistence(false);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (!credential.user.emailVerified) await sendEmailVerification(credential.user, actionCodeSettings());
  await signOut(auth);
}

export async function requestFirebasePasswordReset(email: string) {
  const auth = firebaseAuth();
  // Firebase intentionally returns a generic success path in the UI below so
  // this action does not reveal whether an email address owns an account.
  await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings());
}

function currentFirebaseUserForEmail(currentEmail: string) {
  const auth = firebaseAuth();
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("登入狀態已過期，請重新登入後再修改電子信箱。");
  if (user.email.trim().toLowerCase() !== currentEmail.trim().toLowerCase()) {
    throw new Error("目前 Firebase 身分與共帳帳戶不一致，請重新登入後再試。");
  }
  return user;
}

/** Re-authenticates a Firebase-linked account before a sensitive email change. */
export async function reauthenticateFirebaseEmail(currentEmail: string, currentPassword: string) {
  const user = currentFirebaseUserForEmail(currentEmail);
  const credential = EmailAuthProvider.credential(user.email!, currentPassword);
  await reauthenticateWithCredential(user, credential);
}

/** Re-authenticates a Google-linked Firebase identity for a sensitive action. */
export async function reauthenticateFirebaseGoogle(currentEmail: string) {
  const user = currentFirebaseUserForEmail(currentEmail);
  if (!isGoogleFirebaseUser(user)) {
    throw new Error("目前 Firebase 身分不是 Google 帳戶，請使用原本的電子信箱密碼重新驗證。");
  }
  await reauthenticateWithPopup(user, googleProvider());
  return user.getIdToken(true);
}

/**
 * Sends Firebase's hosted verification action to the new address. The email is
 * not updated locally or on our server until the recipient completes that
 * Firebase-hosted action and signs in with the verified address again.
 */
export async function requestFirebaseEmailChangeVerification(currentEmail: string, newEmail: string) {
  const user = currentFirebaseUserForEmail(currentEmail);
  const verifiedCurrentEmail = user.email!;
  const nextEmail = newEmail.trim().toLowerCase();
  if (!nextEmail || nextEmail === verifiedCurrentEmail.trim().toLowerCase()) {
    throw new Error("請輸入與目前電子信箱不同的新電子信箱。");
  }
  await verifyBeforeUpdateEmail(user, nextEmail, actionCodeSettings());
}

/**
 * Restores only an explicitly remembered Firebase session. The caller still
 * exchanges this short-lived ID token with the server, so sessionVersion
 * revocation and verified-email checks remain enforced server-side.
 */
export async function getPersistedVerifiedFirebaseIdToken() {
  const auth = firebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  try {
    await user.reload();
    if (!auth.currentUser?.emailVerified) {
      await signOut(auth);
      return null;
    }
    return auth.currentUser.getIdToken(true);
  } catch (error) {
    // A transient network failure must not turn an opted-in remembered device
    // into a forced logout. Only Firebase's definitive revocation signals clear
    // the local refresh token; callers can surface a retry state otherwise.
    if (shouldClearPersistedFirebaseIdentity(error)) {
      await signOut(auth);
      return null;
    }
    throw error;
  }
}

export async function firebaseSignOut() {
  const auth = firebaseAuth();
  await signOut(auth);
}

export type { User as FirebaseUser };
