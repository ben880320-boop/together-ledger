import {
  getAuthAutomationStatusByTaskUid,
  recordAuthAutomationRun,
  saveAuthAutomationTaskUid,
  writeAdminAccountAudit,
} from "./db";
import { cleanupUnverifiedEmailPasswordFirebaseIdentities } from "./firebaseAuth";
import { createHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";

const DAILY_AUTH_CLEANUP_JOB_NAME = "together-ledger-unverified-firebase-cleanup-daily";
const DAILY_AUTH_CLEANUP_JOB_PATH = "/api/scheduled/unverified-auth-cleanup";
// 00:15 UTC = 08:15 Asia/Taipei. A once-daily job gives a documented 24–48h window.
const DAILY_AUTH_CLEANUP_CRON = "0 15 0 * * *";
const SYSTEM_AUDIT_ACTOR_ID = 0;

/** Creates or recovers the single project-level daily account cleanup job. */
export async function ensureDailyAuthCleanupAutomation() {
  const jobs = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
  const existing = jobs.jobs.find(job => job.name === DAILY_AUTH_CLEANUP_JOB_NAME && job.callbackPath === DAILY_AUTH_CLEANUP_JOB_PATH);
  if (existing) {
    await saveAuthAutomationTaskUid(existing.taskUid);
    return { taskUid: existing.taskUid, created: false, nextExecutionAt: existing.nextExecutionAt ?? null };
  }
  const created = await createHeartbeatJob({
    name: DAILY_AUTH_CLEANUP_JOB_NAME,
    cron: DAILY_AUTH_CLEANUP_CRON,
    path: DAILY_AUTH_CLEANUP_JOB_PATH,
    method: "POST",
    description: "每日清理超過 24 小時且尚未驗證 Email/Password 的 Firebase-only 註冊身分。",
  }, "");
  await saveAuthAutomationTaskUid(created.taskUid);
  return { taskUid: created.taskUid, created: true, nextExecutionAt: created.nextExecutionAt ?? null };
}

/** Invoked only by the signed Heartbeat callback. The cleanup never touches application DB users. */
export async function processDailyAuthCleanupAutomation(taskUid: string, now = new Date()) {
  const setting = await getAuthAutomationStatusByTaskUid(taskUid);
  if (!setting) return { skipped: "unknown-task" as const, result: null };
  try {
    const result = await cleanupUnverifiedEmailPasswordFirebaseIdentities(now);
    await recordAuthAutomationRun({ taskUid, status: "success", ranAt: now });
    await writeAdminAccountAudit({
      adminUserId: SYSTEM_AUDIT_ACTOR_ID,
      action: "cleanup",
      summary: "每日未驗證 Firebase 身分清理完成",
      metadata: { scanned: result.scanned, eligible: result.eligible, deleted: result.deleted, failed: result.failed },
    });
    return { skipped: null, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAuthAutomationRun({ taskUid, status: "failed", error: message, ranAt: now });
    throw error;
  }
}
