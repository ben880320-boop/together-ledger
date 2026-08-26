import { getApp, getApps, initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  reauthenticateWithCredential,
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
  return error instanceof Error ? error.message : "電子郵件驗證暫時無法完成，請稍後再試。";
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
