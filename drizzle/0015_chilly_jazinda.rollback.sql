-- Rollback for 0015_chilly_jazinda.sql
-- Confirm no application version still reads isArchived before running this destructive schema rollback.
ALTER TABLE `savingsBuckets` DROP COLUMN `isArchived`;
