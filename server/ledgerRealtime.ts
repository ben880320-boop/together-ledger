import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { ledgerMembers } from "../drizzle/schema";
import { getDb, getLedgerChangesSince } from "./db";
import { sdk } from "./_core/sdk";

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_CONNECTION_MS = 4 * 60_000;

function readCursor(req: Request) {
  const raw = req.header("last-event-id") || req.query.cursor;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : 0;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function writeEvent(res: Response, event: string, data: Record<string, unknown>, id?: number) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export const ledgerRealtimeInternals = {
  readCursor,
  writeEvent,
  pollIntervalMs: POLL_INTERVAL_MS,
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
};

/**
 * Provides a low-bandwidth ledger invalidation stream. The stream never sends
 * transaction values or member data; clients refresh through existing typed
 * tRPC procedures after an event arrives.
 */
export async function registerLedgerRealtimeRoute(req: Request, res: Response) {
  const ledgerId = Number.parseInt(req.params.ledgerId, 10);
  if (!Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
    return res.status(400).json({ error: "invalid-ledger" });
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const membership = await db
      .select({ id: ledgerMembers.id })
      .from(ledgerMembers)
      .where(and(eq(ledgerMembers.ledgerId, ledgerId), eq(ledgerMembers.userId, user.id)))
      .limit(1);
    if (!membership[0]) return res.status(403).json({ error: "ledger-access-denied" });

    let cursor = readCursor(req);
    let closed = false;
    let pollInFlight = false;
    let consecutiveErrors = 0;

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    writeEvent(res, "connected", { ledgerId, cursor, retryAfterMs: POLL_INTERVAL_MS });

    const poll = async () => {
      if (closed || pollInFlight) return;
      pollInFlight = true;
      try {
        const events = await getLedgerChangesSince({ ledgerId, cursor });
        for (const event of events) {
          cursor = event.id;
          writeEvent(res, "ledger-change", {
            ledgerId,
            actorUserId: event.actorUserId,
            kind: event.kind,
            entityId: event.entityId,
            createdAt: event.createdAt.toISOString(),
          }, event.id);
        }
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors += 1;
        writeEvent(res, "sync-error", {
          message: "同步事件暫時不可用，將自動重試。",
          retryAfterMs: Math.min(POLL_INTERVAL_MS * consecutiveErrors, 15_000),
        });
      } finally {
        pollInFlight = false;
      }
    };

    const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const heartbeatTimer = setInterval(() => {
      if (!closed) res.write(": heartbeat\n\n");
    }, HEARTBEAT_INTERVAL_MS);
    const reconnectTimer = setTimeout(() => {
      if (!closed) writeEvent(res, "reconnect", { retryAfterMs: 1_000 });
      cleanup();
    }, MAX_CONNECTION_MS);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      clearTimeout(reconnectTimer);
      res.end();
    };
    req.on("close", cleanup);
    void poll();
  } catch (error) {
    console.error("[Realtime] Ledger stream rejected", error);
    if (!res.headersSent) return res.status(500).json({ error: "stream-unavailable" });
    res.end();
  }
}
