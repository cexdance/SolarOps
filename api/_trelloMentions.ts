// SolarOps handle <-> Trello handle, applied to every comment that crosses the
// bridge so a mention notifies the right person on each side.
// Add a person here and nowhere else.
const HANDLES: [solarops: string, trello: string][] = [
  ['alopez', 'anthonylopez28'],
  ['dmatos', 'danielmatos71'],
];

function swap(text: string, from: 0 | 1): string {
  let out = text;
  for (const pair of HANDLES) {
    // Whole handle only: "@alopez" must not match inside "@alopez2" or an email.
    const re = new RegExp(`(^|[^\\w@.])@${pair[from]}(?![\\w])`, 'gi');
    out = out.replace(re, `$1@${pair[1 - from]}`);
  }
  return out;
}

/** SolarOps -> Trello: @alopez becomes @anthonylopez28. */
export const toTrelloMentions = (text: string): string => swap(text, 0);
/** Trello -> SolarOps: @anthonylopez28 becomes @alopez. */
export const fromTrelloMentions = (text: string): string => swap(text, 1);
