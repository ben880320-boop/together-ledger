ALTER TABLE `appNotifications` MODIFY COLUMN `kind` enum('income','expense','settlement','budget') NOT NULL;--> statement-breakpoint
ALTER TABLE `appNotifications` ADD `actionPath` varchar(255);--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `budgetAlert80Enabled` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `budgetAlert100Enabled` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `pushDevices` ADD `lastRegisteredAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `pushDevices` ADD `lastDeliveryAt` timestamp;--> statement-breakpoint
ALTER TABLE `pushDevices` ADD `lastDeliveryStatus` varchar(32);--> statement-breakpoint
ALTER TABLE `pushDevices` ADD `lastDeliveryError` varchar(255);