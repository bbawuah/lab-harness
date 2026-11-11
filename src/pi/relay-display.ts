import { textComponent, wrapColumns } from "./display.ts";
import { terminalHasColor } from "./header.ts";

export type RelayTheme = { fg(role: "accent", text: string): string };

type InboxMessage = { from: string; body: string; senderName?: string };
type Inbox = { messages: InboxMessage[]; unread: number };

function asInbox(value: unknown): Inbox | undefined {
  if (!value || typeof value !== "object") return;
  const inbox = value as Partial<Inbox>;
  if (!Array.isArray(inbox.messages) || typeof inbox.unread !== "number" ||
      inbox.messages.some(message => !message || typeof message.from !== "string" || typeof message.body !== "string")) return;
  return inbox as Inbox;
}

export function relayInboxText(value: unknown): string | undefined {
  const inbox = asInbox(value);
  if (!inbox) return;
  if (!inbox.messages.length) return "No new Relay messages.";
  const messages = inbox.messages.map(message => {
    const sender = typeof message.senderName === "string" ? message.senderName : message.from;
    return `Session ${sender.replace(/[\r\n]/g, " ")} sent:\n${message.body}`;
  });
  const remaining = inbox.unread - inbox.messages.length;
  if (remaining > 0) messages.push(`${remaining} more ${remaining === 1 ? "message" : "messages"} in your inbox.`);
  return messages.join("\n\n");
}

export function relayInboxComponent(details: unknown, fallback: string, expanded = false, theme?: RelayTheme) {
  const inbox = asInbox(details);
  if (!inbox?.messages.length) return textComponent(relayInboxText(details) ?? fallback);
  return {
    render(width: number): string[] {
      const w = Math.max(0, Math.floor(width));
      if (!w) return [];
      const color = theme && terminalHasColor(process.env) ? (text: string) => theme.fg("accent", text) : (text: string) => text;
      const prefix = w >= 4 ? "│  " : "│";
      const inner = Math.max(1, w - prefix.length);
      const rows: string[] = [];
      for (const message of inbox.messages) {
        if (rows.length) rows.push("");
        const sender = (typeof message.senderName === "string" ? message.senderName : message.from).replace(/[\r\n]/g, " ");
        if (w === 1) { rows.push(...wrapColumns(`Relay · Session ${sender}\n${message.body}`, w)); continue; }
        const heading = wrapColumns(`Relay · Session ${sender}`, inner);
        rows.push(...heading.map((line, i) => color((i === 0 ? (w >= 4 ? "╭─ " : "╭") : prefix) + line)));
        rows.push(color(prefix.trimEnd()));
        rows.push(...wrapColumns(message.body, inner).map(line => color(prefix) + line));
        rows.push(color(w >= 4 ? "╰─" : "╰"));
      }
      const remaining = inbox.unread - inbox.messages.length;
      if (remaining > 0) rows.push(...wrapColumns(`${remaining} more ${remaining === 1 ? "message" : "messages"} in your inbox.`, w));
      if (expanded) rows.push("", ...wrapColumns(`Relay details\n${JSON.stringify(details, null, 2)}`, w));
      return rows;
    },
    invalidate() {},
  };
}
