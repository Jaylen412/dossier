-- US job sources: Adzuna, the Bundesagentur für Arbeit and FreeHire are
-- removed. Their rows go from the four tables that name a source (an
-- application made from one of their postings stays: it keeps its own copy,
-- and Posting.applicationId only pointed at it), PostingSource keeps JSEARCH
-- and SERPAPI, a saved choice of a removed source becomes Off, and their
-- settings go.

-- Remove the rows of the removed sources, while the column still has the old type.
DELETE FROM "Posting" WHERE "source"::text IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "PostingSearch" WHERE "source"::text IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "PostingScore" WHERE "source"::text IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "AgentCandidate" WHERE "source"::text IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');

-- AlterEnum
ALTER TYPE "PostingSource" RENAME TO "PostingSource_old";
CREATE TYPE "PostingSource" AS ENUM ('JSEARCH', 'SERPAPI');
ALTER TABLE "Posting" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::text::"PostingSource";
ALTER TABLE "PostingSearch" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::text::"PostingSource";
ALTER TABLE "PostingScore" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::text::"PostingSource";
ALTER TABLE "AgentCandidate" ALTER COLUMN "source" TYPE "PostingSource" USING "source"::text::"PostingSource";
DROP TYPE "PostingSource_old";

-- Settings: a saved removed source reads as Off (not as "use DOSSIER_JOBS_SOURCE"), and the removed sources' settings go.
UPDATE "Setting" SET "value" = 'OFF' WHERE "key" = 'jobSource' AND "value" IN ('ADZUNA', 'ARBEITSAGENTUR', 'FREEHIRE');
DELETE FROM "Setting" WHERE "key" IN ('adzunaAppId', 'adzunaKeyEnc', 'arbeitsagenturAcceptedAt');
