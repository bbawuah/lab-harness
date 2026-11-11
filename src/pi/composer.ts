/** Border-only customization keeps Pi's editing, mouse and completion layout intact. */
type NativeEditor = {
  borderColor(text: string): string;
  renderTopBorder(width: number, hiddenLineCount: number): string;
  renderBottomBorder(width: number, hiddenLineCount: number): string;
};
type EditorConstructor = new (...args: unknown[]) => NativeEditor;
export type ComposerUI = { setEditorComponent(factory: (tui: unknown, theme: unknown, keybindings: unknown) => NativeEditor): void };

export function composerClass(Base: EditorConstructor) {
  return class Composer extends Base {
    renderTopBorder(width: number, hiddenLineCount: number): string {
      const label = "══ Message ";
      // Keep native overflow indicators readable in narrow panes.
      if (width < label.length + 12) return super.renderTopBorder(width, hiddenLineCount).replaceAll("─", "═");
      return this.borderColor(label) + super.renderTopBorder(width - label.length, hiddenLineCount).replaceAll("─", "═");
    }
    renderBottomBorder(width: number, hiddenLineCount: number): string {
      return super.renderBottomBorder(width, hiddenLineCount).replaceAll("─", "═");
    }
  };
}

export async function installComposer(ui: ComposerUI): Promise<void> {
  // Pi resolves this bundled module when it loads the extension; no extra runtime dependency.
  const packageName = "@earendil-works/pi-coding-agent";
  const { CustomEditor } = await import(packageName);
  const Composer = composerClass(CustomEditor);
  ui.setEditorComponent((tui, theme, keybindings) => new Composer(tui, theme, keybindings));
}
