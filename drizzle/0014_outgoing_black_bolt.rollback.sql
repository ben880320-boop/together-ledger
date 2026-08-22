-- Rollback for 0014_outgoing_black_bolt.sql
-- Review for existing savings bucket data before executing; this removes its payment method reference.
ALTER TABLE `savingsBuckets` DROP COLUMN `paymentMethodId`;
