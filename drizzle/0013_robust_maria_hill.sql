CREATE TABLE `savingsAllocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`bucketId` int NOT NULL,
	`transactionId` int,
	`month` varchar(16) NOT NULL,
	`scheduledAmount` int NOT NULL,
	`allocatedAmount` int NOT NULL,
	`shortfallAmount` int NOT NULL,
	`status` enum('completed','partial','skipped') NOT NULL,
	`idempotencyKey` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savingsAllocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `savingsAllocations_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `savingsAutomationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastRunStatus` varchar(32),
	`lastRunError` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savingsAutomationSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `savingsAutomationSettings_scheduleCronTaskUid_unique` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `savingsBuckets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`createdBy` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`icon` varchar(32) NOT NULL DEFAULT '🎯',
	`targetAmount` int NOT NULL,
	`monthlyAmount` int NOT NULL,
	`dayOfMonth` int NOT NULL DEFAULT 1,
	`priority` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savingsBuckets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activityLogs` MODIFY COLUMN `entityType` enum('transaction','category','paymentMethod','budget','recurring','savingsBucket','savingsAllocation') NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `savingsBucketId` int;