export interface SwingEvent {
  type: string;
  agentId?: string;
  blockNumber: string;
  txHash: string;
  data: Record<string, unknown>;
}

/// Tiny in-memory ring buffer of indexed on-chain events for the dashboard feed. A hackathon
/// dashboard reads current state directly from the chain via the API; this is just the activity log.
class EventStore {
  private events: SwingEvent[] = [];
  private seen = new Set<string>();

  add(e: SwingEvent): void {
    const key = `${e.txHash}:${e.type}:${e.blockNumber}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.events.unshift(e);
    if (this.events.length > 200) this.events.pop();
  }

  recent(n = 50): SwingEvent[] {
    return this.events.slice(0, n);
  }
}

export const store = new EventStore();
