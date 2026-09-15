# Timestamp migration deployed, 2026-09-15

User authorized deployment to finish the database fix. Existing project management connection provided SQL access. Live preflight confirmed set_app_data_updated_at fired only BEFORE UPDATE and called set_updated_at(), which uses NOW().

Applied supabase/migrations/20260910_app_data_server_timestamp.sql atomically with a 5-second lock timeout. The installed trigger fires BEFORE INSERT OR UPDATE and calls public.app_data_stamp_updated_at(), assigning pg_catalog.clock_timestamp(). The shared helper and authorization policies were unchanged.

Validation before application: migration and synthetic INSERT, UPDATE, conflicting UPSERT assertions ran inside a rolled-back transaction. Future (2099) and past (1900) client timestamps were overridden by server wall time. After committing the migration, the same assertions passed against the installed trigger in a separate rolled-back transaction. Live catalog confirms the installed function and trigger. Anonymous and authenticated roles cannot execute the function as RPC. Final count: zero leftover probe rows; zero existing rows more than five seconds ahead of database wall time. No customer rows were rewritten.

This completes the previously unapplied timestamp migration. No frontend deployment is required for a database trigger. Other council findings remain separate. Timestamp-based incremental polling still is not a commit-ordered change stream; this fix specifically removes client clock authority on INSERT as well as UPDATE.
