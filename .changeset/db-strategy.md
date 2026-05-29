---
'@idevconn/create-icore': minor
---

`DBStrategy` lib promotes the `--db` flag from cosmetic record to a real runtime dimension. Two concrete implementations ship: `@icore/db-supabase` (Postgres-table-backed JSONB documents) and `@icore/db-firestore` (firebase-admin Firestore). The CLI now writes `DB_PROVIDER` to the generated workspace root `.env`, so consumers can wire their own data microservices over the chosen backend independently of `AUTH_PROVIDER`. Mix-and-match combos like `--auth=firebase --db=supabase` are now first-class.
