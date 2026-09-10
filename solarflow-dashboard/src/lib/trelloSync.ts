// App -> Trello push. The inbound direction (Trello -> app) is the webhook in
// api/trello-card.ts; this is the other half of the mirror.
//
// The working arrangement this serves (user, 2026-08-31): Anthony creates every
// lead card by hand in Trello from the emails that come in, and does not use
// SolarOps. The office works those leads in the LL kanban. So LL is where the
// record moves, and his board has to follow it without him doing anything.
import type { Job, JobLabel, PipelineStage } from '../types';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABEL } from '../types';
import { authedFetch } from './supabase';

/** One Trello list as GET /api/trello-card?lists=1 reports it. */
export interface TrelloList { id: string; name: string; closed: boolean; stage?: string }

/** One LL kanban column. `stage` is what a card dropped here gets. */
export interface BoardColumn { stage: PipelineStage | 'not_on_board'; title: string; closed?: boolean }

const CACHE_KEY = 'solarops_trello_lists';

/**
 * The LL kanban's columns, taken from the Trello board (user decision
 * 2026-09-10: "columns on Trello, new or renamed, need to reflect the LL").
 *
 *  - ORDER and TITLES come from Trello, so a rename or a reorder there is what
 *    the office sees here. Anthony's board is the layout people already know.
 *  - A closed (archived) Trello list is kept ONLY while LL still has cards in
 *    it. Hiding a column must never hide the leads inside it.
 *  - A job whose stage matches no column at all (a list moved to another board,
 *    or an old key) lands in a trailing "Not on the Trello board" column,
 *    shown only when it is non-empty, for the same reason.
 *  - With no Trello data yet (first load offline), the built-in stage list is
 *    the fallback, which is exactly the board as it was before this change.
 *
 * Pure, so the "never hide a card" rule is testable without React.
 */
export function boardColumns(lists: TrelloList[] | null, jobs: Pick<Job, 'pipelineStage'>[]): BoardColumn[] {
  const used = new Set(jobs.map(j => j.pipelineStage).filter(Boolean) as string[]);
  // Archived lists go AFTER the open ones, not in their old Trello position.
  // Trello hides them entirely; left in place, LOST TO COMPETITION (still pos 0)
  // headed the LL board and its "(archived)" note was cut off by the header.
  const ordered = lists ? [...lists.filter(l => !l.closed), ...lists.filter(l => l.closed)] : null;
  const cols: BoardColumn[] = ordered
    ? ordered
        .filter(l => l.stage && (!l.closed || used.has(l.stage)))
        .map(l => ({ stage: l.stage as PipelineStage, title: l.name, ...(l.closed ? { closed: true } : {}) }))
    : PIPELINE_STAGES.map(s => ({ stage: s, title: PIPELINE_STAGE_LABEL[s] }));
  const shown = new Set<string>(cols.map(c => c.stage));
  if ([...used].some(s => !shown.has(s))) cols.push({ stage: 'not_on_board', title: 'Not on the Trello board' });
  return cols;
}

/** Last known Trello lists, so the board draws instantly and works offline. */
export function cachedTrelloLists(): TrelloList[] | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); } catch { return null; }
}

/** Fetch the board's lists and refresh the cache. Resolves null on any failure,
 *  leaving the caller on its cached (or built-in) columns. */
export async function fetchTrelloLists(): Promise<TrelloList[] | null> {
  try {
    const r = await authedFetch('/api/trello-card?lists=1');
    if (!r.ok) return null;
    const { lists } = await r.json() as { lists: TrelloList[] };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(lists)); } catch { /* quota or blocked */ }
    return lists;
  } catch {
    return null;
  }
}

/** Trello-imported leads carry `job-trello-<24 hex card id>`, and only those
 *  have a card to push to. Anything else is a job that was never a Trello card. */
export function trelloCardIdOf(job: Pick<Job, 'id'>): string | undefined {
  const m = /^job-trello-([0-9a-fA-F]{24})$/.exec(job.id ?? '');
  return m ? m[1] : undefined;
}

/** The card fields a Job can drive. Anything absent is left alone on the card. */
export interface TrelloCardPatch {
  stage?: string;
  name?: string;
  labels?: JobLabel[];
}

/**
 * What changed between two versions of a job, in Trello's vocabulary.
 *
 * Returns undefined when nothing Trello cares about moved, which is the common
 * case: this runs on EVERY job save, and most saves are scheduling, costs or
 * photos that have no card representation at all. Pure and exported so the
 * decision is testable without a network.
 */
export function cardPatchFor(prev: Job | undefined, next: Job): TrelloCardPatch | undefined {
  const patch: TrelloCardPatch = {};
  if (next.pipelineStage && next.pipelineStage !== prev?.pipelineStage) {
    patch.stage = next.pipelineStage;
  }
  // clientName, not title: title becomes "WO, <name>" once a lead is converted,
  // and pushing that would rename Anthony's card to internal jargon. The server
  // only applies this over a placeholder filename anyway, so it is belt and
  // braces, but sending the right field costs nothing.
  if (next.clientName && next.clientName !== prev?.clientName) {
    patch.name = next.clientName;
  }
  const a = JSON.stringify((prev?.labels ?? []).map(l => l.name).sort());
  const b = JSON.stringify((next.labels ?? []).map(l => l.name).sort());
  if (a !== b) patch.labels = next.labels ?? [];

  return Object.keys(patch).length > 0 ? patch : undefined;
}

/**
 * Mirror a job's changes onto its Trello card.
 *
 * Fire-and-forget on purpose: the change is already saved locally by the time
 * this runs, so a Trello outage must not block or revert the user's drag. The
 * cost of that choice is that a failed push leaves Trello behind until the next
 * edit to the same job, and the next inbound webhook for the card would then
 * mirror the stale Trello state back over LL. Hence the loud console error,
 * which is the only signal that happened.
 */
export function pushJobToTrello(prev: Job | undefined, next: Job): void {
  const cardId = trelloCardIdOf(next);
  if (!cardId) return;
  const patch = cardPatchFor(prev, next);
  if (!patch) return;

  void authedFetch('/api/trello-card', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, ...patch }),
  })
    .then(async r => {
      if (!r.ok) console.error('[trelloSync] push failed', r.status, await r.text().catch(() => ''));
    })
    .catch(err => console.error('[trelloSync] push failed', err));
}
