import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import * as SecureStore from "expo-secure-store";
import type { AppRouter } from "../../server/routers";

export const SESSION_KEY = "together-ledger-session-token";
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://togetherapp-hdbmsjkf.manus.space"
).replace(/\/$/, "");

export const api = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/api/trpc`,
      transformer: superjson,
      headers: async () => {
        const token = await SecureStore.getItemAsync(SESSION_KEY);
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function saveSessionToken(token: string) {
  await SecureStore.setItemAsync(SESSION_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function isUnauthorized(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    (error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED"
  );
}
