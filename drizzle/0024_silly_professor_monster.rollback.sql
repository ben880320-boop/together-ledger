-- 0024 rollback — preserve audit evidence before running this statement.
-- MySQL will reject this ALTER if `sessionRevoke` rows exist; archive or retain
-- those immutable audit records outside this table before deliberately rolling back.
ALTER TABLE `adminAccountAuditLogs` MODIFY COLUMN `action` enum('promote','delete','emailChange','cleanup') NOT NULL;
