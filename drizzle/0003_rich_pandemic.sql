CREATE TABLE `activityLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(32) NOT NULL,
	`targetType` varchar(32) NOT NULL,
	`targetId` int,
	`summary` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `splitType` enum('equal','custom','amount','none') NOT NULL DEFAULT 'equal';--> statement-breakpoint
ALTER TABLE `categories` ADD `isActive` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `paymentMethods` ADD `isActive` int DEFAULT 1 NOT NULL;