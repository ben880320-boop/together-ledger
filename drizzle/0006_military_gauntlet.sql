CREATE TABLE `appNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ledgerId` int,
	`kind` enum('income','expense','settlement') NOT NULL,
	`title` varchar(128) NOT NULL,
	`body` varchar(255) NOT NULL,
	`dedupeKey` varchar(128) NOT NULL,
	`isRead` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appNotifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `appNotifications_dedupeKey_unique` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`incomeEnabled` int NOT NULL DEFAULT 1,
	`expenseEnabled` int NOT NULL DEFAULT 1,
	`minimumAmount` int NOT NULL DEFAULT 0,
	`monthlySettlementEnabled` int NOT NULL DEFAULT 1,
	`monthlyReminderDay` int NOT NULL DEFAULT 28,
	`scheduleCronTaskUid` varchar(65),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationPreferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `pushDevices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`expoPushToken` varchar(255) NOT NULL,
	`platform` enum('android','ios') NOT NULL DEFAULT 'android',
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pushDevices_id` PRIMARY KEY(`id`),
	CONSTRAINT `pushDevices_expoPushToken_unique` UNIQUE(`expoPushToken`)
);
