export type LedgerRealtimeEventName = "ledger-change" | "sync-error";

export type LedgerEventSourceLike = {
  addEventListener: (event: LedgerRealtimeEventName, listener: (event: Event) => void) => void;
  removeEventListener: (event: LedgerRealtimeEventName, listener: (event: Event) => void) => void;
  close: () => void;
  onerror: ((event: Event) => void) | null;
};

export type LedgerRealtimeSubscriptionOptions = {
  ledgerId: number;
  onChange: () => void;
  onError: () => void;
  debounceMs?: number;
  createEventSource?: (url: string, init: EventSourceInit) => LedgerEventSourceLike;
};

/**
 * 訂閱同源帳本 SSE。事件只代表「資料已改變」，不含財務明細；呼叫端再失效
 * tRPC 快取即可，因此不會用網路事件直接覆寫使用者正在輸入的草稿。
 */
export function subscribeLedgerChanges({
  ledgerId,
  onChange,
  onError,
  debounceMs = 180,
  createEventSource = (url, init) => new EventSource(url, init),
}: LedgerRealtimeSubscriptionOptions) {
  const source = createEventSource(`/api/ledgers/${ledgerId}/events`, { withCredentials: true });
  let changeTimer: ReturnType<typeof setTimeout> | null = null;

  const flushChange = () => {
    changeTimer = null;
    onChange();
  };
  const queueChange = () => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(flushChange, debounceMs);
  };
  const reportError = (_event: Event) => onError();

  source.addEventListener("ledger-change", queueChange);
  source.addEventListener("sync-error", reportError);
  source.onerror = reportError;

  return () => {
    if (changeTimer) clearTimeout(changeTimer);
    source.removeEventListener("ledger-change", queueChange);
    source.removeEventListener("sync-error", reportError);
    source.onerror = null;
    source.close();
  };
}
