import {
  getSavingsAutomationStatusByTaskUid,
  recordSavingsAutomationRun,
  runDueSavingsAllocations,
  saveSavingsAutomationTaskUid,
} from "./db";
import { createHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";

const DAILY_SAVINGS_JOB_NAME = "together-ledger-savings-allocation-daily";
const DAILY_SAVINGS_JOB_PATH = "/api/scheduled/savings-allocations";
// 00:05 UTC = 08:05 Asia/Taipei. Buckets independently decide their due day.
const DAILY_SAVINGS_CRON = "0 5 0 * * *";

/**
 * Creates or recovers the single project-level daily task. The Heartbeat service
 * scopes job names to the owner, so a repeated server start reuses its task.
 */
export async function ensureDailySavingsAutomation() {
  const jobs = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
  const existing = jobs.jobs.find(job => job.name === DAILY_SAVINGS_JOB_NAME && job.callbackPath === DAILY_SAVINGS_JOB_PATH);
  if (existing) {
    await saveSavingsAutomationTaskUid(existing.taskUid);
    return { taskUid: existing.taskUid, created: false, nextExecutionAt: existing.nextExecutionAt ?? null };
  }

  const created = await createHeartbeatJob({
    name: DAILY_SAVINGS_JOB_NAME,
    cron: DAILY_SAVINGS_CRON,
    path: DAILY_SAVINGS_JOB_PATH,
    method: "POST",
    description: "每日檢查到期儲蓄桶並以冪等方式建立資金轉存紀錄。",
  }, "");
  await saveSavingsAutomationTaskUid(created.taskUid);
  return { taskUid: created.taskUid, created: true, nextExecutionAt: created.nextExecutionAt ?? null };
}

/** Invoked only by a signed Heartbeat callback; individual bucket/month keys prevent duplicate transfers. */
export async function processDailySavingsAutomation(taskUid: string, now = new Date()) {
  const setting = await getSavingsAutomationStatusByTaskUid(taskUid);
  if (!setting) return { skipped: "unknown-task" as const, results: [] };
  try {
    const result = await runDueSavingsAllocations(now);
    await recordSavingsAutomationRun({ taskUid, status: "success", ranAt: now });
    return { skipped: null, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSavingsAutomationRun({ taskUid, status: "failed", error: message, ranAt: now });
    throw error;
  }
}
