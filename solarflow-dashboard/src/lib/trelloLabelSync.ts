// App -> Trello label push. The inbound direction (Trello -> app) is the
// webhook in api/trello-card.ts; this is the other half of the mirror.
import type { Job, JobLabel } from '../types';
import { authedFetch } from './supabase';

/** Trello-imported leads carry `job-trello-<24 hex card id>`, and only those
 *  have a card to push to. Anything else is a job that was never a Trello card. */
export function trelloCardIdOf(job: Pick<Job, 'id'>): string | undefined {
  const m = /^job-trello-([0-9a-fA-F]{24})$/.exec(job.id ?? '');
  return m ? m[1] : undefined;
}

/**
 * Mirror the job's labels onto its Trello card.
 *
 * Fire-and-forget on purpose: the label is already saved locally by the time
 * this runs, so a Trello outage must not block or revert the user's click. The
 * cost of that choice is that a failed push leaves Trello behind until the next
 * edit, and the next inbound webhook for the card would then mirror the stale
 * Trello set back over the app's. Hence the loud console error, which is the
 * only signal that happened.
 */
export function pushLabelsToTrello(job: Pick<Job, 'id'>, labels: JobLabel[]): void {
  const cardId = trelloCardIdOf(job);
  if (!cardId) return;
  void authedFetch('/api/trello-card', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, labels }),
  })
    .then(async r => {
      if (!r.ok) console.error('[trelloLabelSync] push failed', r.status, await r.text().catch(() => ''));
    })
    .catch(err => console.error('[trelloLabelSync] push failed', err));
}
