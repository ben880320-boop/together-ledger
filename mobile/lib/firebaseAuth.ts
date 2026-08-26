import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
  type User,
} from "@firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const firebaseEmailActionSettings = {
  // Firebase hosted action pages complete in the browser and return to the
  // existing Web login page; Android then signs in normally with the new email.
  url: "https://togetherapp-hdbmsjkf.manus.space/login?emailAction=complete",
  handleCodeInApp: false,
};

function requireFirebaseConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("Firebase 登入尚未完成設定，請更新至最新版本後再試。");
  }
}

let firebaseAuth: ReturnType<typeof getAuth> | null = null;

function getFirebaseAuth() {
  if (firebaseAuth) {
    firebaseAuth.languageCode = "zh-TW";
    return firebaseAuth;
  }
  requireFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fast refresh or another consumer may already have initialized Auth.
    firebaseAuth = getAuth(app);
  }
  firebaseAuth.languageCode = "zh-TW";
  return firebaseAuth;
}

async function verifiedIdToken(user: User) {
  await user.reload();
  const currentUser = getFirebaseAuth().currentUser;
  if (!currentUser?.emailVerified) {
    throw new Error("請先至電子郵件信箱完成驗證，再回到共帳登入。");
  }
  return currentUser.getIdToken(true);
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

export async function signInWithFirebaseEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  await credential.user.reload();
  if (!auth.currentUser?.emailVerified) {
    await sendEmailVerification(credential.user);
    await signOut(auth);
    throw new Error("此電子信箱尚未驗證；驗證信已重新寄送。請完成驗證後再登入。");
  }
  return verifiedIdToken(credential.user);
}

export async function registerFirebaseEmail(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  await sendEmailVerification(credential.user);
  await signOut(getFirebaseAuth());
}

export async function registerFirebaseEmailWithProfile(input: { email: string; password: string; name: string }) {
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  await updateProfile(credential.user, { displayName: input.name.trim() });
  await sendEmailVerification(credential.user);
  await signOut(auth);
}

export async function resendFirebaseEmailVerification(email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (!credential.user.emailVerified) await sendEmailVerification(credential.user);
  await signOut(auth);
}

export async function requestFirebasePasswordReset(email: string) {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}

function currentFirebaseUserForEmail(currentEmail: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user?.email) throw new Error("登入狀態已過期，請重新登入後再修改電子信箱。");
  if (user.email.trim().toLowerCase() !== currentEmail.trim().toLowerCase()) {
    throw new Error("目前 Firebase 身分與共帳帳戶不一致，請重新登入後再試。");
  }
  return user;
}

/** Re-authenticates a Firebase-linked account before an email change. */
export async function reauthenticateFirebaseEmail(currentEmail: string, currentPassword: string) {
  const user = currentFirebaseUserForEmail(currentEmail);
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, currentPassword));
}

/** Sends Firebase's hosted verification action to a new address without changing app data yet. */
export async function requestFirebaseEmailChangeVerification(currentEmail: string, newEmail: string) {
  const user = currentFirebaseUserForEmail(currentEmail);
  const nextEmail = newEmail.trim().toLowerCase();
  if (!nextEmail || nextEmail === user.email!.trim().toLowerCase()) {
    throw new Error("請輸入與目前電子信箱不同的新電子信箱。");
  }
  await verifyBeforeUpdateEmail(user, nextEmail, firebaseEmailActionSettings);
}

/**
 * Returns a freshly verified Firebase ID token when a persisted Firebase
 * session is still valid. A password reset revokes Firebase refresh tokens,
 * so this intentionally returns null when reauthentication is required.
 */
export async function getPersistedVerifiedFirebaseIdToken() {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await verifiedIdToken(user);
  } catch (error) {
    // Preserve the remembered Firebase session during temporary offline or
    // network failures. Explicit revocation still clears it immediately.
    if (shouldClearPersistedFirebaseIdentity(error)) {
      await signOut(auth);
      return null;
    }
    throw error;
  }
}

export async function signOutFromFirebase() {
  await signOut(getFirebaseAuth());
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
