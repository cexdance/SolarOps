/**
 * A trailing debounce whose pending work can always be forced out.
 *
 * Written for the contractor job editor, whose auto-save writes the WHOLE job
 * and fans it out through the sync engine. That effect depends on three
 * free-text fields, so before this it ran once per keystroke: typing a service
 * note pushed the job once per CHARACTER, which is what filled 28 work orders
 * with 1,690 mirrored comments spelling their notes out letter by letter.
 *
 * The reason this is a named thing rather than an inline setTimeout: a debounce
 * on a field that holds unsaved user input is a DATA-LOSS path. Every way the
 * editor can go away (unmount, tab hidden, phone locked) has to flush, and
 * `flush` has to be a no-op when nothing is pending so those hooks can call it
 * freely. That is the whole contract, and it is what the tests pin.
 */
export interface DebouncedSaver {
  /** Note a change. Restarts the timer; the save runs `ms` after the LAST call. */
  schedule(): void;
  /** Run the pending save now. No-op when nothing is pending. */
  flush(): void;
  /** Drop the pending save without running it. */
  cancel(): void;
  /** Is a save waiting? Exposed for tests and debugging. */
  readonly pending: boolean;
}

export function createDebouncedSaver(save: () => void, ms: number): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  const clear = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  };

  return {
    schedule() {
      pending = true;
      clear();
      timer = setTimeout(() => { timer = undefined; this.flush(); }, ms);
    },
    flush() {
      if (!pending) return;
      // Clear BEFORE saving: a throw inside save must not leave a timer armed to
      // fire the same write again, and must not leave `pending` stuck true.
      pending = false;
      clear();
      save();
    },
    cancel() { pending = false; clear(); },
    get pending() { return pending; },
  };
}
