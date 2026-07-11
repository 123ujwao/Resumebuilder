# supabase/

Supabase schema, RLS policies, and seed data for ResumeForge account metadata.

- `migrations/` — SQL schema + RLS policies
  - `0001_initial_schema.sql` — table definitions (Task 6.1)
  - RLS policies follow in a later migration (Task 6.2)
  - Security-definer RPCs follow in a later migration (Task 6.3)
- `seed.sql` — template for `admins`, `payment_settings`, and `products`, seeded manually by the operator

The web app and extension connect to the operator's own Supabase project via
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` environment variables.
