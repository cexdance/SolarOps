// App -> Trello push. The inbound direction (Trello -> app) is the webhook in
// api/trello-card.ts; this is the other half of the mirror.
//
// The working arrangement this serves (user, 2026-08-31): Anthony creates every
// lead card by hand in Trello from the emails that come in, and does not use
// SolarOps. The office works those leads in the LL kanban. So LL is where the
// record moves, and his board has to follow it without him doing anything.
import type { Job, JobLabel } from '../types';
import { authedFetch } from './supabase';

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
