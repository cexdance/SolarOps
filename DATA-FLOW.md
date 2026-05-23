# SolarOps Data Flow Architecture

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                         SOLAROPS DATA FLOW (v1.7.4)                            ║
╚══════════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────┐
│  USER ACTION (mobile or desktop)                                    │
│  e.g. complete job, paste photo, save note                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REACT STATE (RAM)                                                  │
│  setData(prev => { const next = {...}; saveData(next); return next })│
│  ⚠ Must use prev=> pattern to avoid stale closures                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  saveData() — dataStore.ts                                          │
│                                                                     │
│  STEP 1: Slim the state (Phase 3 optimization)                      │
│    • Strip woPhotos (live in Supabase Storage, not localStorage)    │
│    • Strip customer file content (keep URL only)                    │
│                                                                     │
│  STEP 2: Write to localStorage (synchronous, instant)               │
│    localStorage.setItem('solarflow_data', JSON.stringify(slimState))│
│    ✅ Data SAFE locally even if Supabase is down                    │
│                                                                     │
│  STEP 3: Async cloud backup                                         │
│    dbSet('solarflow_data', fullState) — fire and forget             │
└────────────────┬────────────────────────────────────────────────────┘
                 │ async (non-blocking)
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  dbSet() — db.ts                                                    │
│                                                                     │
│  if key === 'solarflow_data':                                       │
│    → pushToSupabase(state)    ← full AppState                      │
│  else:                                                              │
│    → pushKeyValue(key, value) ← single KV row                      │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  pushToSupabase() — syncEngine.ts                                   │
│                                                                     │
│  1. Push customer rows (bulk upsert)                                │
│     app_data table: key="customer::{id}", value={...customer}       │
│                                                                     │
│  2. Push job rows (INDIVIDUALLY to avoid one bloated row failing    │
│     the batch — known risk if woPhotos still present as base64)     │
│     app_data table: key="job::{id}", value={...job}                 │
│                                                                     │
│  3. Push legacy blob                                                │
│     app_data table: key="solarflow_data", value={entire state}      │
│                                                                     │
│  ✅ SUCCESS → clearPendingPush()                                    │
│  ❌ FAILURE → markPushPending(error) + fire CustomEvent             │
└────────────┬───────────────────────────────────────────────────────┘
             │ on failure
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTBOX — outbox.ts                                                 │
│                                                                     │
│  localStorage key: solarops_outbox_v1                               │
│  Stores: { timestamp, error, attempts }                             │
│                                                                     │
│  drainOutbox() called by:                                           │
│    • useSyncEngine() poll interval                                  │
│    • window 'online' event                                          │
│    • Tab 'visibilitychange' event                                   │
│                                                                     │
│  ⚠ DEADLOCK: if attempts > 8 → STOPS RETRYING                      │
│    "Too many consecutive failures, skipping drain until user action" │
│    User must force-reload to reset counter                          │
└─────────────────────────────────────────────────────────────────────┘
             │ CustomEvent: solarops:sync-error
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  UI BANNER — "Failed to sync to cloud. Will retry automatically."   │
│  (StorageWarningBanner.tsx listens to solarops:storage-warning)     │
└─────────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════╗
║  ON NEXT APP LOAD — PULL PATH                                       ║
╚══════════════════════════════════════════════════════════════════════╝

App.tsx useEffect on mount:
  Promise.race([syncFromDB(), 8s timeout])   ← v1.7.4 fix
    ↓
  pullFromSupabase() — syncEngine.ts
    • Incremental pull: only rows updated_at > lastSyncedAt
    • Pulls customer:: prefix
    • Pulls job:: prefix
    • Pulls legacy blob
    ↓
  mergeRemote(local, remote)
    • Local wins for user-created records
    • Tombstone list prevents deleted records from returning
    • New remote records are added
    ↓
  setData(merged) + setDbReady(true)
    ↓
  App renders ✅


╔══════════════════════════════════════════════════════════════════════╗
║  PHOTO / FILE FLOW                                                  ║
╚══════════════════════════════════════════════════════════════════════╝

Customer Notes paste:
  Clipboard image
    → handleNotePaste() (Customers.tsx)
    → uploadCustomerFiles() (customerFileStorage.ts)
    → Supabase Storage bucket: customer-files/{customerId}/{YYYY-MM}/{ts}-{name}
    → Returns public URL
    → Stored as customer.files[].url  ✅ URL only, no base64

  ❌ FAILURE: toast.error("Failed to upload files: ...") — v1.7.4

Work Order photos (WO Panel):
  Camera/file picker
    → woPhotos[] in RAM
    → saveData() STRIPS woPhotos before localStorage
    → pushToSupabase() includes full woPhotos (base64 dataUrl)
    → Stored as job row in app_data

  ⚠ RISK: If job row with base64 photos > Supabase row size limit
    → push fails → outbox queued → if >8 retries → LOST


╔══════════════════════════════════════════════════════════════════════╗
║  WHAT WENT WRONG — US-15609 FORENSIC SUMMARY                       ║
╚══════════════════════════════════════════════════════════════════════╝

Timeline:
  10:37 AM  Work order created
  09:01 PM  Job completed on mobile (10h 24m on site)
             → State saved to mobile localStorage ✅
             → pushToSupabase() called
             → Supabase returned: "upstream request timeout" ❌
             → markPushPending() → outbox queued
             → Banner shown: "Failed to sync to cloud"
             → drainOutbox() retried 8 times → GAVE UP ❌

  Next load  syncFromDB() on other device (desktop)
             → Supabase still timing out
             → 8s timeout fires (v1.7.4 fix) → falls back to local data
             → Local desktop data has NO completed job (never received it)
             → Shows job as "Scheduled" ← what we saw in forensics

DATA STATUS:
  ✅ SAFE: Job completion data IS in localStorage on the mobile device
  ❌ NOT synced to Supabase yet (outbox gave up after 8 retries)
  ❌ Desktop sees stale data (job still "Scheduled")

RECOVERY PATH:
  1. Open app on the mobile device that completed the job
  2. App will attempt drainOutbox() on load
  3. ⚠ If attempts > 8, must force-reset outbox (reload clears counter)
  4. Once Supabase connection stable, data will sync to cloud
```
