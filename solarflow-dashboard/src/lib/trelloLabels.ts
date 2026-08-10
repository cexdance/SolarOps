// Maps a Trello label colour key to a Tailwind chip class so the LL board's
// cards look like the Trello board the team already uses.
//
// IMPORTANT: the class strings are FULL and static. Tailwind purges any class
// name it can't see as a literal in source, so `bg-${x}-100` would render
// unstyled. Every family below is spelled out on purpose.

const CHIP: Record<string, string> = {
  green:  'bg-green-100 text-green-800 border-green-300',
  lime:   'bg-lime-100 text-lime-800 border-lime-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
  red:    'bg-red-100 text-red-800 border-red-300',
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  pink:   'bg-pink-100 text-pink-800 border-pink-300',
  blue:   'bg-blue-100 text-blue-800 border-blue-300',
  sky:    'bg-sky-100 text-sky-800 border-sky-300',
  slate:  'bg-slate-100 text-slate-700 border-slate-300',
};

/**
 * Tailwind chip classes for a Trello label colour. Trello suffixes shades
 * (`_dark`/`_light`) and uses a few names Tailwind lacks (`black`), plus null/''
 * for an unnamed colour-less label; all fold to a sensible base.
 */
export function labelChipClass(color?: string | null): string {
  const base = (color || '').replace(/_(dark|light)$/, '');
  const family =
    base === 'black' ? 'slate' :
    base in CHIP ? base :
    'slate';
  return CHIP[family];
}
