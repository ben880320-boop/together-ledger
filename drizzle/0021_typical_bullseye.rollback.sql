-- Rollback for 0021_typical_bullseye.sql.
-- Run only after confirming no user account is using Firebase Authentication.
ALTER TABLE `users` DROP INDEX `users_firebaseUid_unique`;
ALTER TABLE `users` DROP COLUMN `firebaseUid`;
