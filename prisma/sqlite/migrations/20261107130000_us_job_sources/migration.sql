-- US job sources: Adzuna, the Bundesagentur für Arbeit and FreeHire are
-- removed. Their rows go from the four tables that name a source (an
-- application made from one of their postings stays: it keeps its own copy,
-- and Posting.applicationId only pointed at it), a saved choice of a removed
-- source becomes Off, and their settings go. The source column is plain TEXT
-- here, so the enum needs no change.

-- Remove the rows of the removed sources.
DELETE FROM "Posting" WHERE "source" IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "PostingSearch" WHERE "source" IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "PostingScore" WHERE "source" IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "AgentCandidate" WHERE "source" IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');

-- Settings: a saved removed source reads as Off (not as "use DOSSIER_JOBS_SOURCE"), and the removed sources' settings go.
UPDATE "Setting" SET "value" = 'OFF' WHERE "key" = 'jobSource' AND "value" IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "Setting" WHERE "key" IN ('adzunaAppId', 'adzunaKeyEnc', 'arbeitsagenturAcceptedAt');
