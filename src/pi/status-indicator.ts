/**
 * Generic persistent footer chip on Pi's ctx.ui.setStatus. State is carried by
 * the glyph (● active, ○ off, ! attention), never by colour alone. Shared by the
 * browser, permission modes and future desktop control; label/detail are
 * escaped and bounded so untrusted origins cannot drive the terminal.
 */
import { fitColumns } from './terminal-text.ts';
export type IndicatorGlyph = '●' | '○' | '!';
export type IndicatorState = { glyph: IndicatorGlyph; label: string; detail?: string };
export type StatusUI = { setStatus?(key: string, text: string | undefined): void };
export const indicatorLimit = 48;
export function indicatorText(state: IndicatorState): string {
  const body = state.label + (state.detail ? ' ' + state.detail : '');
  return fitColumns(state.glyph + ' ' + body, indicatorLimit);
}
/** Set or clear (undefined) one keyed chip. Missing UI (print/json modes) is a no-op. */
export function setIndicator(ui: StatusUI | undefined, key: string, state: IndicatorState | undefined): void {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(key)) throw new Error('LAB_INDICATOR_KEY');
  ui?.setStatus?.(key, state ? indicatorText(state) : undefined);
}
