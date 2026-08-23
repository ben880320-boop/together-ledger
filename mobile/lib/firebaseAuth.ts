import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "@firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

function requireFirebaseConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("Firebase 登入尚未完成設定，請更新至最新版本後再試。");
  }
}

let firebaseAuth: ReturnType<typeof getAuth> | null = null;

function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;
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
  } catch {
    await signOut(auth);
    return null;
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
