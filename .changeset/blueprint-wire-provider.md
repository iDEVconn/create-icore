---
'@idevconn/create-icore': patch
---

Refactor: consolidate wire-auth/wire-storage/wire-db into a single generic wire-provider (writeProvider + cleanupUnusedAxis). Removes triplicated helpers. Side effect: the auth axis now also strips unchosen providers' raw SDK deps from the auth package.json (fixes an orphaned @supabase/supabase-js left in non-supabase auth scaffolds).
