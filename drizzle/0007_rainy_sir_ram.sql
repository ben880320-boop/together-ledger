ALTER TABLE `notificationPreferences` MODIFY COLUMN `incomeEnabled` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notificationPreferences` MODIFY COLUMN `expenseEnabled` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notificationPreferences` MODIFY COLUMN `monthlySettlementEnabled` int NOT NULL DEFAULT 0;