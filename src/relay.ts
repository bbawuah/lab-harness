import { join } from "node:path";
import { createMessageStore } from "../vendor/relay/src/storage/store.ts";
import { createMessageService } from "../vendor/relay/src/messages/service.ts";
import { createDirectory } from "../vendor/relay/src/directory/index.ts";
import type { BoundMailbox, Delivery, ReceiveBinding } from "./protocol.ts";
import { ownedState } from "./ledger.ts";
import { requireThat } from "./util.ts";

export const RELAY_PIN = "dfe1b039bab45f4055ab39467e994a2981940c02";
/** Real pinned Relay store/service. Only disposable explicitly owned local state. */
export class RelayBus {
  private readonly store: ReturnType<typeof createMessageStore>;
  private readonly service: ReturnType<typeof createMessageService>;
  private readonly directory: ReturnType<typeof createDirectory>;
  readonly busId: string;
  constructor(stateDir: string) {
    const root = ownedState(stateDir); this.busId = root;
    this.store = createMessageStore({ path: join(root, "messages.sqlite") });
    this.service = createMessageService({ store: this.store }); this.directory = createDirectory({ store: this.store });
  }
  register(namespace: string, name: string): string {
    const existing = this.store.listPeers(namespace).find(p => p.name === name);
    if (existing) return existing.id;
    return this.directory.register({ namespace, name, endpoint: { host: "manual", sessionId: `concept:${namespace}:${name}`, generation: 0, target: {} } }).id;
  }
  send(namespace: string, sender: string, to: string, body: string, requestKey: string) {
    return this.service.send({ namespace, from: sender, to, body, requestKey });
  }
  mailbox(namespace: string, peerId: string): BoundMailbox {
    requireThat(this.store.listPeers(namespace).some(p => p.id === peerId), "UNKNOWN_BOUND_PEER");
    const binding: ReceiveBinding = Object.freeze({ busId: this.busId, namespace, peerId });
    return { binding,
      inbox: (): Delivery[] => this.service.read({ namespace, peerId }).map(e => ({ busId: this.busId, namespace, recipient: e.to, messageId: e.id, body: e.body })),
      ack: ids => this.service.ack({ namespace, peerId, ids }),
    };
  }
  close(): void { this.store.close(); }
}
