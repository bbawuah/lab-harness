/**
 * Generic persistent footer chip on Pi's ctx.ui.setStatus. State is carried by
 * the glyph (● active, ○ off, ! attention), never by colour alone. Shared by the
 * browser, permission modes and future desktop control; label/detail are
 * escaped and bounded so untrusted origins cannot drive the terminal.
 */
import { fitColumns } from './display.ts';
export type IndicatorGlyph = '●' | '○' | '!';
export type IndicatorState = { glyph: IndicatorGlyph; label: string; detail?: string };
export type StatusUI = { setStatus?(key: string, text: string | undefined): void };
export const indicatorLimit = 48;
/**
 * Footer slots. Pi 1.4.0 puts every status on one footer line sorted by key
 * (localeCompare), joins them with a space and cuts the line from the right
 * with "...". Key order is therefore keep order: the permission mode sorts
 * first and is never cut while the line is at least as wide as the mode text;
 * the web chip is cut next, desktop control first. Use these keys only.
 */
export const indicatorSlots = { mode: 'lab-mode', web: 'lab-web', desktop: 'lab-x-desktop' } as const;
export type IndicatorSlot = (typeof indicatorSlots)[keyof typeof indicatorSlots];
export function indicatorText(state: IndicatorState): string {
  const body = state.label + (state.detail ? ' ' + state.detail : '');
  return fitColumns(state.glyph + ' ' + body, indicatorLimit);
}
/** Set or clear (undefined) one keyed chip. Missing UI (print/json modes) is a no-op. */
export function setIndicator(ui: StatusUI | undefined, key: IndicatorSlot, state: IndicatorState | undefined): void {
  if (!Object.values(indicatorSlots).includes(key)) throw new Error('LAB_INDICATOR_KEY');
  ui?.setStatus?.(key, state ? indicatorText(state) : undefined);
}
