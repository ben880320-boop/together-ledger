CREATE TABLE `ledgerSyncEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`kind` varchar(64) NOT NULL,
	`entityId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledgerSyncEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ledgerSyncEvents_ledger_cursor_idx` ON `ledgerSyncEvents` (`ledgerId`,`id`);