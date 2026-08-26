import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { processMonthlySettlementReminderForTask } from "../notifications";
import { ensureDailySavingsAutomation, processDailySavingsAutomation } from "../savingsAutomation";
import { processDailyAuthCleanupAutomation } from "../authAutomation";
import { seedLegacyPasswordLoginDeadlines } from "../db";
import { registerLedgerRealtimeRoute } from "../ledgerRealtime";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { resolveListenConfig } from "./listenConfig";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/ledgers/:ledgerId/events", registerLedgerRealtimeRoute);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  app.post("/api/scheduled/monthly-settlement-reminders", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await processMonthlySettlementReminderForTask(user.taskUid);
      return res.json({ ok: true, ...result, taskUid: user.taskUid });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      console.error("[Scheduled] monthly settlement reminders failed", normalized);
      return res.status(500).json({
        error: normalized.message,
        stack: normalized.stack,
        context: { path: req.path },
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.post("/api/scheduled/savings-allocations", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await processDailySavingsAutomation(user.taskUid);
      return res.json({ ok: true, ...result, taskUid: user.taskUid });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      console.error("[Scheduled] savings allocations failed", normalized);
      return res.status(500).json({
        error: normalized.message,
        stack: normalized.stack,
        context: { path: req.path },
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.post("/api/scheduled/unverified-auth-cleanup", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await processDailyAuthCleanupAutomation(user.taskUid);
      return res.json({ ok: true, ...result, taskUid: user.taskUid });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      console.error("[Scheduled] unverified Firebase identity cleanup failed", normalized);
      return res.status(500).json({
        error: normalized.message,
        stack: normalized.stack,
        context: { path: req.path },
        timestamp: new Date().toISOString(),
      });
    }
  });
  void ensureDailySavingsAutomation().catch(error => {
    console.error("[Scheduled] could not ensure daily savings automation", error);
  });
  void seedLegacyPasswordLoginDeadlines().catch(error => {
    console.error("[Auth] could not seed legacy password migration deadlines", error);
  });
  // The new cleanup task is deliberately not created at startup. It is enabled
  // only after this callback is checkpointed and the owner confirms production
  // deployment, so no pre-release environment can delete Firebase identities.
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const listenConfig = resolveListenConfig({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
  });
  const port = listenConfig.allowPortFallback
    ? await findAvailablePort(listenConfig.port)
    : listenConfig.port;

  if (port !== listenConfig.port) {
    console.log(`Port ${listenConfig.port} is busy, using port ${port} instead`);
  }

  server.listen(port, listenConfig.host, () => {
    console.log(`Server running on http://${listenConfig.host}:${port}/`);
  });
}

startServer().catch(error => {
  console.error("[Startup] Server failed to start", error);
  process.exitCode = 1;
});
