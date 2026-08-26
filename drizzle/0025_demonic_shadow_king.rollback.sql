-- Roll back v1.3.19 operational observability only.
-- Run this only after exporting any operationalSecurityEvents records that must be retained.
DROP TABLE IF EXISTS `operationalSecurityEvents`;
