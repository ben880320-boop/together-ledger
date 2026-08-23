import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function assertFirebaseConfig() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("電子郵件登入尚未完成設定，請稍後再試或使用既有帳密登入。");
  }
}

function firebaseAuth() {
  assertFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

function actionCodeSettings() {
  return {
    // Firebase 的安全驗證頁完成後回到既有登入頁；不能指向未註冊的路由。
    url: `${window.location.origin}/login?emailAction=complete`,
    handleCodeInApp: false,
  };
}

export function messageOfFirebaseError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "電子信箱或密碼錯誤。";
  if (code === "auth/email-already-in-use") return "此電子信箱已註冊，請直接登入或使用忘記密碼。";
  if (code === "auth/weak-password") return "密碼強度不足，請使用至少 8 個字元。";
  if (code === "auth/too-many-requests") return "嘗試次數過多，請稍後再試或使用忘記密碼。";
  if (code === "auth/network-request-failed") return "網路連線失敗，請確認連線後重試。";
  return error instanceof Error ? error.message : "電子郵件驗證暫時無法完成，請稍後再試。";
}

export async function registerFirebaseEmail(input: { email: string; password: string; name: string }) {
  const auth = firebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  await updateProfile(credential.user, { displayName: input.name.trim() });
  await sendEmailVerification(credential.user, actionCodeSettings());
  await signOut(auth);
}

export async function signInFirebaseEmail(email: string, password: string) {
  const auth = firebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user, actionCodeSettings());
    await signOut(auth);
    throw new Error("此電子信箱尚未驗證；驗證信已重新寄送。請完成驗證後再登入。");
  }
  return credential.user.getIdToken(true);
}

export async function resendFirebaseVerification(email: string, password: string) {
  const auth = firebaseAuth();
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

export async function firebaseSignOut() {
  const auth = firebaseAuth();
  await signOut(auth);
}

export type { User as FirebaseUser };
