import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

function getFirebaseAuth() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawServiceAccount) throw new Error("Firebase 服務帳號尚未設定。請稍後再試或聯絡管理員。");

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(rawServiceAccount) as Record<string, string>;
  } catch {
    throw new Error("Firebase 服務帳號設定格式不正確。");
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Firebase 服務帳號設定不完整。");
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  return getAuth(app);
}

export type VerifiedFirebaseIdentity = Pick<DecodedIdToken, "uid" | "email" | "email_verified" | "auth_time"> & { name?: string };

export async function verifyFirebaseIdentity(idToken: string): Promise<VerifiedFirebaseIdentity> {
  const decoded = await getFirebaseAuth().verifyIdToken(idToken, true);
  if (!decoded.email || !decoded.email_verified) {
    throw new Error("請先完成電子信箱驗證，再登入共帳。");
  }
  return decoded;
}

/**
 * Destructive account actions require a recently authenticated Firebase token.
 * `auth_time` is issued by Firebase and cannot be set by a client script.
 */
export async function verifyRecentlyAuthenticatedFirebaseIdentity(
  idToken: string,
  maxAgeSeconds = 5 * 60
): Promise<VerifiedFirebaseIdentity> {
  const identity = await verifyFirebaseIdentity(idToken);
  const ageSeconds = Math.floor(Date.now() / 1000) - identity.auth_time;
  if (!Number.isFinite(identity.auth_time) || ageSeconds < 0 || ageSeconds > maxAgeSeconds) {
    throw new Error("為保護帳號安全，請重新輸入 Firebase 密碼後再刪除帳號。");
  }
  return identity;
}

/** Deletes only the Firebase Authentication identity after a recent re-authentication check. */
export async function deleteFirebaseIdentity(firebaseUid: string) {
  await getFirebaseAuth().deleteUser(firebaseUid);
}
