-- Roll back only after confirming no active session-version invalidation is required.
-- This removes the revocation counter but does not alter user IDs, Firebase UIDs,
-- ledger membership, transactions, or any accounting data.
ALTER TABLE `users` DROP COLUMN `sessionVersion`;
