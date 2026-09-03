# One-level undo, plan

## Short answer

Yes, and cheaper than it looks. `App.tsx:715` holds `const [data, setData] = useState<AppState>(...)`
and every user mutation is the same shape:

```ts
setData(prev => { const next = {...prev, ...}; saveData(next); return next; });
```

~21 of those sites. That is the choke point. One undo slot, one added line per site.

`pushToSupabase` is dirty-tracked per record (`isDirty(customer:<id>)`), so restoring a
record pushes only that record. Undo rides the existing write path. No new sync code.

## Capacity, honestly

### Undoable (records living in App.tsx `data`)
- customer create / update / delete / merge
- job (service order) create / update / delete, incl. the hard delete at `syncEngine.ts:1030`
- standalone RMA create / update
- contractor-job mirror into admin jobs
- lead conversion, Trello + Excel imports (one undo reverts the whole batch, it is one `setData`)

### NOT undoable, and should say so
- **Anything already sent outward.** Xero draft invoices, the site-transfer email, Trello
  label/list pushes, notification bells. Those left the building. Undo restores local state
  and the invoice still exists.
- **Other stores.** contractorStore blob, inventory, tools, photos, todos, messages, mentions,
  site profiles. Separate save paths, not in `data`. Out of scope for v1.
- **A remote change that landed after your edit.** Undo restores the touched records only
  (see below), so unrelated remote work is safe, but if another user edited the SAME record
  in the gap, undo wins under LWW. Accepted: the window is seconds.
- **Cross-device / cross-reload.** One in-memory slot. Reload clears it. Deliberate: a stale
  undo button is worse than no undo button.

## Design

### 1. `src/lib/undo.ts` (new, ~40 lines)

Do NOT snapshot the whole AppState. Snapshot only the records that changed.

```ts
type Slot = {
  label: string;
  customers: Array<Customer | { id: string; __gone: true }>;
  jobs:      Array<Job      | { id: string; __gone: true }>;
  tombstones: { customers: string[]; jobs: string[] }; // cleared on undo
};
let slot: Slot | null = null;

export function markUndo(label: string, prev: AppState, next: AppState): void
export function peekUndo(): { label: string } | null
export function takeUndo(): Slot | null
export function applyUndo(cur: AppState, s: Slot): AppState
```

`markUndo` diffs `prev` vs `next` by id (JSON compare, same trick as `diffEntity`) and keeps
the `prev` version of each differing record. A record present in `prev` and absent in `next`
is a delete, keep it for re-insert. A record absent in `prev` and present in `next` is a
create, store `{id, __gone:true}` so undo removes it.

`applyUndo` splices those records back into the CURRENT state, leaving every untouched
record alone. That is what keeps undo from clobbering concurrent remote work.

**The non-obvious part:** deletes write tombstones (`handleDeleteCustomer` writes
`solarflow_deleted_customer_ids`, `handleDeleteJob` calls `markJobDeleted`). Undo of a delete
MUST clear the tombstone first or the restored record is filtered right back out by
`pushToSupabase` and `mergeRemote`. `syncEngine` needs a matching
`unmarkCustomerDeleted(id)` / `unmarkJobDeleted(id)`.

### 2. Call sites (one line each)

```ts
setData(prev => {
  const next = { ...prev, jobs: prev.jobs.filter(j => j.id !== jobId) };
  markUndo('Deleted work order', prev, next);   // <- added
  saveData(next);
  return next;
});
```

Add it ONLY at user-initiated handlers. Skip `useSyncEngine`'s `setData` (line 955) and the
realtime/merge paths, or you hand the user a button that reverts someone else's change.

### 3. The undo action itself

```ts
const doUndo = () => {
  const s = takeUndo();
  if (!s) return;
  clearTombstones(s.tombstones);
  setData(cur => { const next = applyUndo(cur, s); saveData(next); return next; });
  logChange('undo', 'app', s.label, { label: s.label }, currentUser?.email);
};
```

`saveData` already triggers the debounced push, and dirty-tracking limits it to the restored
records. Undo is logged so the audit trail shows it, and undo is NOT itself undoable (single
slot, already taken).

### 4. UI

Toast on mutation: `Deleted work order.  [Undo]`, 8s. Plus `Cmd/Ctrl+Z` bound at the app
level, ignored when focus is in an input (the browser's own text undo must keep working).
No undo history panel, no redo.

## Order of work

1. `lib/undo.ts` + `unmarkCustomerDeleted` / `unmarkJobDeleted` in syncEngine
2. One vitest in `src/__tests__/` covering: update-undo, delete-undo restores + clears
   tombstone, create-undo removes, and undo does NOT revert an unrelated record changed
   after the snapshot. That last case is the whole point of the design.
3. Wire the 6 highest-value handlers first: `handleDeleteJob`, `handleDeleteCustomer`,
   `handleUpdateJob`, `handleUpdateCustomer`, `handleMergeCustomers`, `handleConvertLead`
4. Toast + keybinding
5. Remaining handlers

## Skipped
- Undo stack, redo, cross-device undo. Add when one level is proven insufficient.
- Undo for the contractor/inventory/photo stores. Add when someone actually asks.
- Undoing outward side effects (Xero, email, Trello). The toast should say what it will not
  undo when the mutation had one.
