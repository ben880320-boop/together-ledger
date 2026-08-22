import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import * as SecureStore from "expo-secure-store";
import type { AppRouter } from "../../server/routers";

export const SESSION_KEY = "together-ledger-session-token";
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://togetherapp-hdbmsjkf.manus.space"
).replace(/\/$/, "");

const apiFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json") || contentType.includes("application/problem+json");
  if (!isJson) {
    throw new Error("伺服器暫時回傳了非預期內容，請稍後再試。若持續發生，請檢查 App 是否已更新至最新版本。");
  }
  return response;
};

export const api = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/api/trpc`,
      transformer: superjson,
      fetch: apiFetch,
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

export type LedgerRealtimeEvent = {
  cursor: number;
  kind: string;
  entityId: number | null;
  actorUserId: number;
  createdAt: string;
};

type LedgerRealtimeHandlers = {
  onEvent: (event: LedgerRealtimeEvent) => void;
  onError?: (error: Error) => void;
  cursor?: number;
};

const realtimeRetryDelay = (attempt: number) => Math.min(1_000 * Math.max(1, attempt), 15_000);

const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/**
 * React Native does not include a browser EventSource implementation. This
 * reader keeps the same SSE protocol as web/PWA, reconnects with Last-Event-ID
 * and never persists financial content outside the existing tRPC cache.
 */
export function subscribeLedgerEvents(ledgerId: number, handlers: LedgerRealtimeHandlers) {
  const controller = new AbortController();
  let stopped = false;
  let cursor = handlers.cursor ?? 0;

  const parseFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    let eventName = "message";
    let eventId = 0;
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("id:")) eventId = Number.parseInt(line.slice(3).trim(), 10) || 0;
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (eventName !== "ledger-change" || !data) return;
    const payload = JSON.parse(data) as Omit<LedgerRealtimeEvent, "cursor">;
    const nextCursor = eventId || cursor;
    if (!Number.isSafeInteger(nextCursor) || nextCursor <= cursor) return;
    cursor = nextCursor;
    handlers.onEvent({ ...payload, cursor });
  };

  const connect = async () => {
    let failures = 0;
    while (!stopped) {
      try {
        const token = await getSessionToken();
        if (!token) throw new Error("登入憑證已失效，請重新登入後再試。");
        const response = await fetch(`${API_BASE_URL}/api/ledgers/${ledgerId}/events`, {
          signal: controller.signal,
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
            ...(cursor > 0 ? { "Last-Event-ID": String(cursor) } : {}),
          },
        });
        if (!response.ok) throw new Error(`即時同步連線失敗（${response.status}）。`);
        if (!response.body || typeof response.body.getReader !== "function") {
          throw new Error("目前裝置不支援即時同步串流，已保留手動重新整理。 ");
        }
        failures = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            if (frame && !frame.startsWith(":")) parseFrame(frame);
          }
        }
        try { await reader.cancel(); } catch {}
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        failures += 1;
        handlers.onError?.(error instanceof Error ? error : new Error("即時同步暫時不可用。"));
      }
      if (!stopped) await pause(realtimeRetryDelay(failures));
    }
  };

  void connect();
  return () => {
    stopped = true;
    controller.abort();
  };
}

export function isUnauthorized(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    (error as { data?: { code?: string } }).data?.code === "UNAUTHORIZED"
  );
}
