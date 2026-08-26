CREATE TABLE `adminAccountAuditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminUserId` int NOT NULL,
	`targetUserId` int,
	`action` enum('promote','delete','emailChange','cleanup') NOT NULL,
	`summary` varchar(255) NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminAccountAuditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `authAutomationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastRunStatus` varchar(32),
	`lastRunError` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `authAutomationSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `authAutomationSettings_scheduleCronTaskUid_unique` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `legacyPasswordLoginDeadline` timestamp;--> statement-breakpoint
CREATE INDEX `admin_account_audit_admin_created_idx` ON `adminAccountAuditLogs` (`adminUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_account_audit_target_created_idx` ON `adminAccountAuditLogs` (`targetUserId`,`createdAt`);