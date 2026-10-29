/** Bounded VT text replay of actual bytes; no application layout or Pi renderer. */
export class TerminalScreen {
  private buffer = "";
  private cells: string[][] = [];
  private x = 0; private y = 0; private saved: [number, number] = [0, 0];
  private top = 0; private bottom: number;
  private wrap = true; private visible = true;
  readonly unknown = new Set<string>();
  constructor(public cols: number, public rows: number) { this.bottom = rows - 1; this.clear(); }
  private blank() { return Array<string>(this.cols).fill(" "); }
  private clear() { this.cells = Array.from({ length: this.rows }, () => this.blank()); }
  resize(cols: number, rows: number) {
    this.cols = cols; this.rows = rows; this.top = 0; this.bottom = rows - 1;
    this.clear(); this.x = Math.min(this.x, cols - 1); this.y = Math.min(this.y, rows - 1);
  }
  private down() {
    if (this.y === this.bottom) { this.cells.splice(this.top, 1); this.cells.splice(this.bottom, 0, this.blank()); }
    else this.y = Math.min(this.rows - 1, this.y + 1);
  }
  write(text: string) {
    this.buffer += text;
    if (this.buffer.length > 2_000_000) throw new Error("VT buffer bound");
    while (this.buffer.length) {
      if (this.buffer[0] === "\x1b") {
        if (this.buffer.length < 2) return;
        const kind = this.buffer[1];
        if (kind === "[") {
          const match = /^\x1b\[([0-?]*)([ -/]*)([@-~])/.exec(this.buffer);
          if (!match) return;
          this.csi(match[1]!, match[2]!, match[3]!); this.buffer = this.buffer.slice(match[0].length); continue;
        }
        if (kind === "]" || kind === "P" || kind === "_" || kind === "^") {
          const end = /\x07|\x1b\\/.exec(this.buffer.slice(2)); if (!end) return;
          this.buffer = this.buffer.slice(2 + end.index + end[0].length); continue;
        }
        if (kind === "7") this.saved = [this.x, this.y];
        else if (kind === "8") [this.x, this.y] = this.saved;
        else if (kind === "D") this.down();
        else if (kind === "M") {
          if (this.y === this.top) { this.cells.splice(this.bottom, 1); this.cells.splice(this.top, 0, this.blank()); }
          else this.y = Math.max(0, this.y - 1);
        } else if (kind === "(") { if (this.buffer.length < 3) return; this.buffer = this.buffer.slice(3); continue; }
        else this.unknown.add(`ESC ${JSON.stringify(kind)}`);
        this.buffer = this.buffer.slice(2); continue;
      }
      const cp = this.buffer.codePointAt(0)!; const char = String.fromCodePoint(cp);
      this.buffer = this.buffer.slice(char.length);
      if (char === "\r") { this.x = 0; continue; }
      if (char === "\n") { this.down(); continue; }
      if (char === "\b") { this.x = Math.max(0, this.x - 1); continue; }
      if (char === "\t") { this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8); continue; }
      if (cp < 32 || cp === 127) continue;
      if (/\p{Mark}/u.test(char)) {
        let col = Math.min(this.cols - 1, this.x - 1); if (this.cells[this.y]?.[col] === "") col--;
        if (col >= 0) this.cells[this.y]![col] += char; else this.unknown.add("unattached combining mark");
        continue;
      }
      const width = cp >= 0x1100 && (cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xff01 && cp <= 0xff60 || cp >= 0x1f300) ? 2 : 1;
      if (this.x >= this.cols) { if (this.wrap) { this.x = 0; this.down(); } else this.x = this.cols - 1; }
      this.cells[this.y]![this.x] = char;
      if (width === 2 && this.x + 1 < this.cols) this.cells[this.y]![this.x + 1] = "";
      this.x += width;
    }
  }
  private csi(raw: string, intermediate: string, final: string) {
    const p = raw.replace(/^[?<=>]/, "").split(";").map(v => Number(v) || 0);
    const n = p[0] || 1;
    if (intermediate || raw.startsWith(">") || raw.startsWith("<") || raw.startsWith("=")) {
      if (final === "u" || final === "q" || final === "m" || final === "c") return;
      this.unknown.add(`CSI ${raw}${intermediate}${final}`); return;
    }
    if (final === "H" || final === "f") { this.y = Math.min(this.rows - 1, (p[0] || 1) - 1); this.x = Math.min(this.cols - 1, (p[1] || 1) - 1); }
    else if (final === "A") this.y = Math.max(0, this.y - n);
    else if (final === "B" || final === "e") this.y = Math.min(this.rows - 1, this.y + n);
    else if (final === "C" || final === "a") this.x = Math.min(this.cols - 1, this.x + n);
    else if (final === "D") this.x = Math.max(0, this.x - n);
    else if (final === "G" || final === "`") this.x = Math.min(this.cols - 1, n - 1);
    else if (final === "d") this.y = Math.min(this.rows - 1, n - 1);
    else if (final === "E") { this.x = 0; this.y = Math.min(this.rows - 1, this.y + n); }
    else if (final === "F") { this.x = 0; this.y = Math.max(0, this.y - n); }
    else if (final === "J") {
      if (p[0] === 2 || p[0] === 3) this.clear();
      else if (p[0] === 0) { this.cells[this.y]!.fill(" ", this.x); for (let row = this.y + 1; row < this.rows; row++) this.cells[row] = this.blank(); }
      else { for (let row = 0; row < this.y; row++) this.cells[row] = this.blank(); this.cells[this.y]!.fill(" ", 0, this.x + 1); }
    } else if (final === "K") this.cells[this.y]!.fill(" ", p[0] === 1 || p[0] === 2 ? 0 : this.x, p[0] === 1 ? this.x + 1 : this.cols);
    else if (final === "X") this.cells[this.y]!.fill(" ", this.x, Math.min(this.cols, this.x + n));
    else if (final === "P") { this.cells[this.y]!.splice(this.x, n); while (this.cells[this.y]!.length < this.cols) this.cells[this.y]!.push(" "); }
    else if (final === "@") { this.cells[this.y]!.splice(this.x, 0, ...Array<string>(Math.min(n, this.cols)).fill(" ")); this.cells[this.y]!.length = this.cols; }
    else if (final === "S" || final === "T") {
      for (let i = 0; i < Math.min(n, this.rows); i++) {
        if (final === "S") { this.cells.splice(this.top, 1); this.cells.splice(this.bottom, 0, this.blank()); }
        else { this.cells.splice(this.bottom, 1); this.cells.splice(this.top, 0, this.blank()); }
      }
    } else if (final === "r") { this.top = Math.max(0, (p[0] || 1) - 1); this.bottom = Math.min(this.rows - 1, (p[1] || this.rows) - 1); this.x = this.y = 0; }
    else if ((final === "h" || final === "l") && raw.startsWith("?")) {
      for (const mode of p) {
        if (mode === 7) this.wrap = final === "h";
        else if (mode === 25) this.visible = final === "h";
        else if (mode === 1049 && final === "h") { this.clear(); this.x = this.y = 0; }
        else if (![1, 12, 1000, 1002, 1003, 1004, 1006, 1015, 1049, 2004, 2026, 2027, 2031].includes(mode)) this.unknown.add(`mode ${mode}`);
      }
    } else if (final === "s") this.saved = [this.x, this.y];
    else if (final === "u" && !raw.startsWith("?")) [this.x, this.y] = this.saved;
    else if (!["m", "n", "c", "t", "u"].includes(final)) this.unknown.add(`CSI ${raw}${final}`);
  }
  snapshot() { return { cols: this.cols, rows: this.rows, lines: this.cells.map(row => row.join("")), cursor: { x: this.x, y: this.y, visible: this.visible }, unknown: [...this.unknown], pendingBytes: this.buffer.length }; }
}
