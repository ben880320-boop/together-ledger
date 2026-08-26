CREATE TABLE `operationalSecurityEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event` enum('rememberRestore','sessionRevoke','syncConflict') NOT NULL,
	`source` enum('web','pwa','android','server') NOT NULL,
	`outcome` enum('success','failure') NOT NULL,
	`code` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operationalSecurityEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `operationalSecurityEvents_event_created_idx` ON `operationalSecurityEvents` (`event`,`createdAt`);