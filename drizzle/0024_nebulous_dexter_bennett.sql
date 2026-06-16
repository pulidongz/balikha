ALTER TABLE "search_events" ADD COLUMN "is_suspected_bot" boolean DEFAULT false NOT NULL;

-- One-time backfill (ticket #114): flag pre-existing scanner rows. Best-effort
-- SQL approximation of lib/search/bot-filter.ts; new rows use the JS classifier.
-- DML keywords require their companion (drop TABLE, insert INTO, …) to match the
-- JS co-occurrence rule so real existing rows like "drop earrings" aren't flagged.
UPDATE "search_events" SET "is_suspected_bot" = true
WHERE length("query") > 80
   OR "query" ~* '(\yselect\y.*\yfrom\y|\yunion\y.*\yselect\y|\yinsert\s+into\y|\ydelete\s+from\y|\yupdate\y\s+\S+\s+\yset\y|\ydrop\s+(table|database)\y|\yalter\s+table\y|0x[0-9a-f]{4,}|/\*|<script|\y(or|and)\y\s+[0-9]+\s*=\s*[0-9]+)';
