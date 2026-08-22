import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeLedgerChanges, type LedgerRealtimeEventName } from "./ledgerRealtime";

class FakeLedgerEventSource {
  listeners = new Map<LedgerRealtimeEventName, Set<(event: Event) => void>>();
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  addEventListener(event: LedgerRealtimeEventName, listener: (event: Event) => void) {
    const listeners = this.listeners.get(event) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event: LedgerRealtimeEventName, listener: (event: Event) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: LedgerRealtimeEventName) {
    this.listeners.get(event)?.forEach(listener => listener(new Event(event)));
  }

  close() {
    this.closed = true;
  }
}

describe("帳本 SSE 訂閱器", () => {
  afterEach(() => vi.useRealTimers());

  it("以同源端點訂閱、合併密集異動並在清理時關閉連線", () => {
    vi.useFakeTimers();
    const source = new FakeLedgerEventSource();
    const onChange = vi.fn();
    const onError = vi.fn();
    const createEventSource = vi.fn(() => source);

    const unsubscribe = subscribeLedgerChanges({ ledgerId: 42, onChange, onError, createEventSource });
    expect(createEventSource).toHaveBeenCalledWith("/api/ledgers/42/events", { withCredentials: true });

    source.emit("ledger-change");
    source.emit("ledger-change");
    vi.advanceTimersByTime(179);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    source.emit("sync-error");
    source.onerror?.(new Event("error"));
    expect(onError).toHaveBeenCalledTimes(2);

    unsubscribe();
    expect(source.closed).toBe(true);
    source.emit("ledger-change");
    vi.advanceTimersByTime(180);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
