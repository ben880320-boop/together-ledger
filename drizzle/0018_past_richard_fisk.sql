CREATE TABLE `diagnosticReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` enum('android','ios','web') NOT NULL,
	`appVersion` varchar(32) NOT NULL,
	`errorCode` varchar(80) NOT NULL,
	`message` varchar(512) NOT NULL,
	`stack` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `diagnosticReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `diagnosticReportsEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `diagnosticReports_user_created_idx` ON `diagnosticReports` (`userId`,`createdAt`);