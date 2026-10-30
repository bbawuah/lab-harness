/** Pure, bounded presentation of Relay data. The underlying payload is never changed. */
export type RelayPeer = { id: string; name?: string; presence?: string; self?: boolean };
export type RelayView = {
  action: "peers" | "send" | "inbox" | "ack";
  request?: unknown;
  result?: unknown;
  error?: string;
  peers?: readonly RelayPeer[];
  pending?: boolean;
};

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const control = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const escapeChar = (char: string) => {
  const n = char.codePointAt(0)!;
  return n <= 0xff ? `\\x${n.toString(16).padStart(2, "0")}` : `\\u{${n.toString(16)}}`;
};
export function safeRelayText(value: string): string {
  return Array.from(value, char => char === "\n" ? char : control.test(char) ? escapeChar(char) : char).join("");
}
const labelText = (text: string) => safeRelayText(text).replaceAll("\n", "\\n");
const obj = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

export function relayPeerLabel(id: string, peers: readonly RelayPeer[] = []): string {
  try {
    const catalog = Array.isArray(peers) ? peers.slice(0, 500).filter(p => p && typeof p.id === "string") : [];
    const peer = catalog.find(p => p.id === id) ?? catalog.find(p => p.name === id);
    const project = string(peer?.name).split("/")[0] || "Peer";
    const identity = string(peer?.id) || string(id) || "?";
    let length = Math.min(6, identity.length);
    while (length < identity.length && catalog.some(p => p.id !== identity && p.id.slice(-length) === identity.slice(-length))) length++;
    return `${labelText(project.slice(0, 120))} ${labelText(identity.slice(-length))}`;
  } catch { return "Peer ?"; }
}

/** Wrap by terminal cells; an oversized grapheme is replaced at widths below its size. */
function wrap(text: string, width: number, limit: number): { lines: string[]; truncated: boolean } {
  const lines: string[] = []; let line = "", cells = 0, truncated = false;
  const push = () => { if (lines.length >= limit) { truncated = true; return false; } lines.push(line); line = ""; cells = 0; return true; };
  for (const { segment } of segmenter.segment(text)) {
    if (segment === "\n") { if (!push()) break; continue; }
    const w = Bun.stringWidth(segment);
    if (cells + w > width && line && !push()) break;
    if (w > width) { line += "?"; cells++; } else { line += segment; cells += w; }
  }
  if (!truncated && (line || !lines.length || text.endsWith("\n"))) push();
  return { lines, truncated };
}

// Copy only a bounded part of arbitrary legacy data before JSON serialization.
function details(value: unknown): { text: string; truncated: boolean } {
  let budget = 12000, nodes = 0, truncated = false;
  const seen = new WeakSet<object>();
  function copy(input: unknown, depth: number): unknown {
    if (++nodes > 300 || depth > 8 || budget <= 0) { truncated = true; return "[truncated]"; }
    if (typeof input === "string") {
      const part = input.slice(0, Math.min(4000, budget)); budget -= part.length;
      if (part.length < input.length) truncated = true;
      return part;
    }
    if (input === null || typeof input === "boolean" || typeof input === "number") return input;
    if (typeof input !== "object") { truncated = true; return `[${typeof input}]`; }
    if (seen.has(input)) { truncated = true; return "[circular]"; }
    seen.add(input);
    if (Array.isArray(input)) {
      const out: unknown[] = [];
      for (let i = 0; i < Math.min(input.length, 100) && nodes < 300 && budget > 0; i++) out.push(copy(input[i], depth + 1));
      if (out.length < input.length) truncated = true;
      return out;
    }
    const out: Record<string, unknown> = Object.create(null);
    let keys: string[];
    try { keys = Object.keys(input); } catch { truncated = true; return "[unavailable]"; }
    for (const key of keys.slice(0, 100)) {
      if (nodes >= 300 || budget <= 0) { truncated = true; break; }
      const boundedKey = key.slice(0, 500); budget -= boundedKey.length;
      if (boundedKey.length < key.length) truncated = true;
      try { out[boundedKey] = copy((input as Record<string, unknown>)[key], depth + 1); } catch { out[boundedKey] = "[unavailable]"; truncated = true; }
    }
    if (keys.length > 100) truncated = true;
    return out;
  }
  try { return { text: safeRelayText(JSON.stringify(copy(value, 0), null, 2) ?? "null"), truncated }; }
  catch { return { text: "[unavailable]", truncated: true }; }
}

export type RelayRenderOptions = { expanded?: boolean; ascii?: boolean; detailsHint?: boolean };
export type RelayRow = { text: string; role: "title" | "title-continuation" | "body" | "meta" | "detail"; direction?: "in" | "out" };

/** Semantic annotations come from the formatter, never by interpreting message text. */
export function renderRelayRows(view: RelayView, width: number, options: RelayRenderOptions = {}): RelayRow[] {
  const size = Number.isFinite(width) ? Math.min(1000, Math.max(0, Math.floor(width))) : 0;
  if (!size) return [];
  const lines: RelayRow[] = [];
  const sep = options.ascii ? " - " : " · ";
  const add = (text: string, role: RelayRow["role"] = "meta", direction?: RelayRow["direction"]) => {
    lines.push(...wrap(safeRelayText(text), size, 400).lines.map((line, index) => ({ text: line, role: role === "title" && index > 0 ? "title-continuation" as const : role, ...(index === 0 && direction ? { direction } : {}) })));
  };
  let hinted = false;
  const hint = () => { if (!hinted && options.detailsHint !== false) { add("[Details: expand with Ctrl+O (or /hotkeys)]"); hinted = true; } };
  const body = (text: string) => {
    // Bound work before wrapping even if historical data is unexpectedly huge.
    const part = text.slice(0, 16000), wrapped = wrap(safeRelayText(part), size, 3);
    lines.push(...wrapped.lines.map(text => ({ text, role: "body" as const })));
    if (wrapped.truncated || part.length < text.length) hint();
  };
  try {
    const request = obj(view.request), result = obj(view.result);
    const pagePeers = Array.isArray(result.peers) ? result.peers : [];
    const peers = [...(Array.isArray(view.peers) ? view.peers.slice(0, 500) : []), ...pagePeers.slice(0, 500)] as RelayPeer[];
    const label = (id: unknown) => relayPeerLabel(string(id), peers);
    const title = (text: string) => add(`Relay${sep}${text}`, "title", text.startsWith("Received from ") ? "in" : /^(?:Send|Sent) to /.test(text) ? "out" : undefined);
    if (view.error !== undefined) {
      const action = { peers: "Peers", send: "Send", inbox: "Inbox", ack: "Ack" }[view.action] ?? "Operation";
      const cancelled = view.error === "RELAY_CANCELLED";
      title(`${action} ${cancelled ? "cancelled" : "failed"}`);
      const known = ["RELAY_INVALID", "RELAY_INVALID_PARAMETERS", "RELAY_SESSION_NOT_READY", "RELAY_SESSION_BINDING_REQUIRED", "RELAY_CONFLICT", "RELAY_UNKNOWN_PEER", "RELAY_TOO_LARGE", "RELAY_BACKPRESSURE", "RELAY_UNSUPPORTED", "RELAY_CANCELLED", "RELAY_OPERATION_REFUSED", "LAB_BRIDGE_INPUT_LIMIT"];
      const usage = ["Use /relay-send PEER REQUEST_KEY MESSAGE", "Use /relay-ack MESSAGE_ID [MESSAGE_ID ...]", "Use /relay-peers [OFFSET]", "Use /relay-inbox [WAIT_MS]"];
      if (known.includes(view.error) || usage.includes(view.error)) add(view.error);
      if (view.error === "LAB_BRIDGE_INPUT_LIMIT") add("Request exceeds the bridge input limit and was rejected before execution; nothing was sent.");
      else if (view.action === "send") add("The outcome may be unknown and the message may have stored. For an exact retry, reuse the request key and payload.");
      else if (!cancelled) add("Check the request and Relay session, then try again.");
    } else if (view.pending) {
      if (view.action === "send") { title(`Send to ${label(request.to)}`); if (typeof request.body === "string") body(request.body); }
      else title(`${({ peers: "Peers", inbox: "Inbox", ack: "Ack" } as Record<string, string>)[view.action] ?? "Operation"} pending`);
    } else if (view.action === "send") {
      if (result.state === "stored") {
        title(`Sent to ${label(request.to)} (stored)`);
        if (result.duplicate === true) add("Already stored; no duplicate created");
        if (typeof request.body === "string") body(request.body);
      } else { title("Send outcome unknown"); add("The message may have stored. For an exact retry, reuse the request key and payload."); }
    } else if (view.action === "inbox") {
      const messages = Array.isArray(result.messages) ? result.messages : [];
      if (!Array.isArray(result.messages)) title("Inbox result unavailable");
      else if (!messages.length) title(result.timedOut === true ? "Inbox empty; no messages fetched before the wait ended" : "Inbox empty");
      for (const item of messages.slice(0, 100)) {
        const message = obj(item);
        if (typeof message.from !== "string" || typeof message.body !== "string") { add("[Malformed fetched message omitted]"); continue; }
        title(`Received from ${label(message.from)}`);
        body(message.body);
      }
      if (messages.length > 100) { add("[More messages omitted]"); hint(); }
      if (messages.length) add("Fetched; not acknowledged");
    } else if (view.action === "peers") {
      title("Peers");
      if (!pagePeers.length) add("No peers on this page");
      for (const item of pagePeers.slice(0, 100)) {
        const peer = obj(item);
        add(`${label(peer.id)}${peer.self === true ? " (self)" : ""}${typeof peer.presence === "string" ? ` - ${labelText(peer.presence.slice(0, 120))}` : ""}`);
      }
      const total = count(result.total), next = count(result.nextOffset);
      if (total !== undefined) add(`${pagePeers.length} shown; ${total} total${next !== undefined ? "; more pages available" : ""}`);
      if (pagePeers.length > 100) { add("[More peers omitted]"); hint(); }
    } else if (view.action === "ack") {
      const acknowledged = count(result.acknowledged), ignored = count(result.ignored);
      if (acknowledged === undefined) title("Ack outcome unknown");
      else title(`Acknowledged ${acknowledged} message(s)${ignored !== undefined ? `; ignored ${ignored}` : ""}`);
    }
    if (!view.pending && !options.expanded) hint();
    if (options.expanded) {
      // Keep actionable identifiers ahead of the separately bounded JSON body.
      // Valid Relay references are at most 128 UTF-16 code units.
      const identifier = (name: string, value: unknown) => {
        if (typeof value !== "string") return;
        const prefix = value.slice(0, 128);
        const rendered = wrap(`${name}: ${labelText(prefix)}`, size, 2000);
        lines.push(...rendered.lines.map(text => ({ text, role: "detail" as const })));
        if (prefix.length < value.length || rendered.truncated) add("[Identifier truncated]");
      };
      if (view.action === "inbox" && Array.isArray(result.messages)) {
        add("Message identifiers:");
        for (const [index, item] of result.messages.slice(0, 10).entries()) {
          const message = obj(item);
          add(`Message ${index + 1}:`);
          identifier("Message ID", message.id);
          identifier("Sender ID", message.from);
        }
        if (result.messages.length > 10) add("[Further message identifiers omitted]");
      } else if (view.action === "peers" && Array.isArray(result.peers)) {
        add("Peer identifiers:");
        for (const [index, item] of result.peers.slice(0, 50).entries()) {
          const peer = obj(item);
          add(`Peer ${index + 1}:`);
          identifier("Peer ID", peer.id);
          identifier("Name", peer.name);
        }
        if (result.peers.length > 50) add("[Further peer identifiers omitted]");
      } else if (view.action === "send") {
        add("Send identifiers:");
        identifier("Recipient", request.to);
        const recipient = peers.find(peer => peer && peer.name === request.to);
        if (recipient && recipient.id !== request.to) identifier("Recipient ID", recipient.id);
        identifier("Request key", request.requestKey);
        identifier("Receipt ID", result.id);
      }
      add("Details (request and result):");
      const detail = details({ request: view.request, result: view.result, ...(view.error !== undefined ? { error: view.error } : {}) });
      const wrapped = wrap(detail.text, size, 120);
      lines.push(...wrapped.lines.map(text => ({ text, role: "detail" as const })));
      if (detail.truncated || wrapped.truncated) add("[Details truncated; full data remains in the original payload]");
    }
  } catch { add("Relay presentation unavailable"); }
  return lines;
}

/** Existing plain-text surface is preserved for notifications and nonstyled consumers. */
export function renderRelayView(view: RelayView, width: number, options: RelayRenderOptions = {}): string[] {
  return renderRelayRows(view, width, options).map(row => row.text);
}
