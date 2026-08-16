ALTER TABLE `activityLogs` RENAME COLUMN `targetType` TO `entityType`;--> statement-breakpoint
ALTER TABLE `activityLogs` RENAME COLUMN `targetId` TO `entityId`;--> statement-breakpoint
ALTER TABLE `activityLogs` MODIFY COLUMN `action` enum('create','update','delete') NOT NULL;--> statement-breakpoint
ALTER TABLE `activityLogs` MODIFY COLUMN `entityType` enum('transaction','category','paymentMethod') NOT NULL;--> statement-breakpoint
ALTER TABLE `activityLogs` MODIFY COLUMN `entityId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `activityLogs` MODIFY COLUMN `summary` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `activityLogs` ADD `metadata` text;