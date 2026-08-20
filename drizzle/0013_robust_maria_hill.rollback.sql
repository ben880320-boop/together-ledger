-- Rollback for 0013_robust_maria_hill.sql.
-- Run only after exporting any savings bucket, allocation, and linked transfer
-- records that must be retained. This removes the newly introduced feature data.

ALTER TABLE `transactions` DROP COLUMN `savingsBucketId`;
ALTER TABLE `activityLogs` MODIFY COLUMN `entityType` enum('transaction','category','paymentMethod','budget','recurring') NOT NULL;
DROP TABLE IF EXISTS `savingsAutomationSettings`;
DROP TABLE IF EXISTS `savingsAllocations`;
DROP TABLE IF EXISTS `savingsBuckets`;
