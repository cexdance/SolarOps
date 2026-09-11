# Trello attachment backfill, limited test report

Run 2026-09-07 with `--apply --limit 5` against production. 5 customer records, 30 files.

## Result

| | |
|---|---|
| Files copied | 30 |
| Failed | 0 |
| Customer rows updated | 5 |
| Remaining after this run | 159 files across 51 customers |

Customers processed: Ciampi (1), Rachel Hober (1), Mister 01 Warehouse Hialieah (23), Jarrod Hollander (2), Pavel (3).

## Independent verification

The script's own log is not evidence. Everything below was checked separately.

**Database.** File URLs across all customer records now split:

| Kind | Files | Customers |
|---|---|---|
| supabase storage | 36 | 10 |
| trello.com, not yet copied | 159 | 49 |
| other (ups.com, one stray) | 2 | 2 |

**Storage objects exist with real sizes**, not uniform placeholder bodies: 1530 kB, 103 kB, 6344 bytes, 390 kB, 66 kB across the first five.

**Unauthenticated fetch of the copied files**, which is what a second user actually does:

| File | Status | Bytes | Magic |
|---|---|---|---|
| solar panel Warehouse 305 fully executed.pdf | 200 | 2,892,338 | PDF |
| US-15389 Mister01 Office.pdf | 200 | 2,812,249 | PDF |
| image.jpeg | 200 | 1,828,600 | WEBP |
| IMG_5236.jpeg | 200 | 1,567,061 | JPEG |

Real file magic bytes in every case, so these are the actual documents and not HTML error pages wearing a filename.

**The control.** One of the 159 not-yet-copied Trello URLs, fetched the same way with no auth:

```
status: 401 | content-type: text/plain | 33 bytes
body: "unauthorized permission requested"
```

That is the original bug, reproduced on demand. The diagnosis holds: these files were never readable by anyone but a logged-in Trello member with board access.

**Idempotency.** A second dry run reports 159 files across 51 customers, down from 189 across 56. Completed records are skipped, so a re-run after a partial failure picks up only what is left.

## Defect found and fixed before the full run

Trello serves most attachment downloads as `application/octet-stream`. The script took that content-type verbatim, so a PDF was stored and served back labelled as a generic binary blob. Both the script and the `api/trello-card.ts` import branch now fall back to the file extension whenever Trello's type is the generic one.

Functionally the 30 test files are fine: they download and open correctly, and the app renders every non-image attachment as a download link regardless of type. But their stored content-type stays `application/octet-stream`, because the backfill skips anything already on Storage. Cosmetic, affects inline preview only. If it matters later, the fix is a `--force` flag, not a re-run.

## Not yet done

159 files across 51 customers. Same command without `--limit`:

```
cd solarflow-dashboard && node scripts/backfill-trello-attachments.mjs --apply
```

Largest remaining single record is Davood Nahal at 11 files. Hard-refresh open tabs afterward: a stale tab is a live sync client and will re-push the old URLs.
