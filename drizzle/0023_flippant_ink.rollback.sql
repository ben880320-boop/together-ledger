-- 0023 rollback — execute only after exporting adminAccountAuditLogs for retention.
-- This migration adds nullable metadata and new audit/automation tables only; it does not alter ledgers or transactions.
-- IMPORTANT: dropping adminAccountAuditLogs permanently removes privileged-action evidence.

DROP INDEX `admin_account_audit_target_created_idx` ON `adminAccountAuditLogs`;
DROP INDEX `admin_account_audit_admin_created_idx` ON `adminAccountAuditLogs`;
DROP TABLE `authAutomationSettings`;
DROP TABLE `adminAccountAuditLogs`;
ALTER TABLE `users` DROP COLUMN `legacyPasswordLoginDeadline`;
