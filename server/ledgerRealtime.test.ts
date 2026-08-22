import { describe, expect, it, vi } from "vitest";
import { ledgerRealtimeInternals } from "./ledgerRealtime";

describe("帳本 SSE 即時同步協定", () => {
  it("優先解析安全的 Last-Event-ID，並拒絕無效或負數游標", () => {
    const withHeader = {
      header: vi.fn((name: string) => name === "last-event-id" ? "42" : undefined),
      query: { cursor: "8" },
    } as any;
    const withQuery = {
      header: vi.fn(() => undefined),
      query: { cursor: "17" },
    } as any;

    expect(ledgerRealtimeInternals.readCursor(withHeader)).toBe(42);
    expect(ledgerRealtimeInternals.readCursor(withQuery)).toBe(17);
    expect(ledgerRealtimeInternals.readCursor({ header: () => "-1", query: {} } as any)).toBe(0);
    expect(ledgerRealtimeInternals.readCursor({ header: () => "not-a-number", query: {} } as any)).toBe(0);
  });

  it("以 SSE id、event 與 JSON data 封裝游標事件，不含財務明細", () => {
    const write = vi.fn();
    ledgerRealtimeInternals.writeEvent(
      { write } as any,
      "ledger-change",
      { ledgerId: 12, kind: "transaction.updated", entityId: 88 },
      240,
    );

    expect(write).toHaveBeenNthCalledWith(1, "id: 240\n");
    expect(write).toHaveBeenNthCalledWith(2, "event: ledger-change\n");
    expect(write).toHaveBeenNthCalledWith(3, 'data: {"ledgerId":12,"kind":"transaction.updated","entityId":88}\n\n');
  });

  it("維持低頻輪詢與心跳的協定上限", () => {
    expect(ledgerRealtimeInternals.pollIntervalMs).toBe(2_000);
    expect(ledgerRealtimeInternals.heartbeatIntervalMs).toBe(25_000);
  });
});
