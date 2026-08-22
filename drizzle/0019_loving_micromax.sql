CREATE TABLE `monthlySettlementSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`month` varchar(16) NOT NULL,
	`fromUserId` int NOT NULL,
	`toUserId` int NOT NULL,
	`amount` int NOT NULL,
	`proposedByUserId` int NOT NULL,
	`confirmedByUserId` int,
	`status` enum('pending','settled','reopened') NOT NULL DEFAULT 'pending',
	`version` int NOT NULL DEFAULT 1,
	`proposedAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	`reopenedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthlySettlementSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `monthly_settlements_ledger_month_idx` ON `monthlySettlementSnapshots` (`ledgerId`,`month`);--> statement-breakpoint
CREATE INDEX `monthly_settlements_ledger_status_idx` ON `monthlySettlementSnapshots` (`ledgerId`,`status`);--> statement-breakpoint
CREATE INDEX `transactions_ledger_date_idx` ON `transactions` (`ledgerId`,`date`);