CREATE TABLE `travelPlans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`createdBy` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`budget` int NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `travelPlans_id` PRIMARY KEY(`id`)
);
