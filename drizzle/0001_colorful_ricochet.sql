CREATE TABLE `budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`categoryId` int NOT NULL DEFAULT 0,
	`amount` int NOT NULL,
	`month` varchar(16) NOT NULL,
	CONSTRAINT `budgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`type` enum('expense','income') NOT NULL DEFAULT 'expense',
	`icon` varchar(32) NOT NULL DEFAULT '🍜',
	`color` varchar(32) NOT NULL DEFAULT '#FF6B6B',
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledgerMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','member','viewer') NOT NULL DEFAULT 'member',
	`nickname` varchar(64),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledgerMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('couple','roommate','family','travel','custom') NOT NULL DEFAULT 'couple',
	`currency` varchar(8) NOT NULL DEFAULT 'NT$',
	`inviteCode` varchar(16) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledgers_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledgers_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `paymentMethods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`icon` varchar(32) NOT NULL DEFAULT '💳',
	CONSTRAINT `paymentMethods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recurringTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(128) NOT NULL,
	`amount` int NOT NULL,
	`type` enum('expense','income') NOT NULL DEFAULT 'expense',
	`categoryId` int NOT NULL,
	`paymentMethodId` int NOT NULL,
	`frequency` enum('weekly','monthly','yearly') NOT NULL DEFAULT 'monthly',
	`dayOfMonth` int NOT NULL DEFAULT 1,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recurringTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`fromUserId` int NOT NULL,
	`toUserId` int NOT NULL,
	`amount` int NOT NULL,
	`month` varchar(16) NOT NULL,
	`status` enum('pending','settled') NOT NULL DEFAULT 'settled',
	`settledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactionSplits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`userId` int NOT NULL,
	`shareAmount` int NOT NULL,
	CONSTRAINT `transactionSplits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`payerId` int NOT NULL,
	`amount` int NOT NULL,
	`type` enum('expense','income','transfer') NOT NULL DEFAULT 'expense',
	`categoryId` int NOT NULL,
	`paymentMethodId` int NOT NULL,
	`date` timestamp NOT NULL,
	`note` text,
	`receiptUrl` text,
	`splitType` enum('equal','custom','amount') NOT NULL DEFAULT 'equal',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
