import { ENGINE_URL } from "./config";

export interface Reputation {
  score: number;
  tier: number;
  updatedAt: string;
  epoch: number;
  evidenceHash: string;
  tierName: string;
}

export interface CreditLine {
  account: string;
  tier: number;
  aprBps: number;
  liquidated: boolean;
  openedAt: string;
  lastAccruedAt: string;
  limit: string;
  principal: string;
  interestAccrued: string;
  collateral: string;
}

export interface AgentState {
  agentId: string;
  reputation: Reputation;
  line: CreditLine;
  accountUsdc: string;
}

export interface ScoreComponents {
  zPnl: number;
  win: number;
  oneMinusDd: number;
  consistency: number;
  jobs: number;
  validation: number;
  age: number;
  sybil: number;
}

export interface ScoreResult {
  prevScore?: number;
  score: number;
  tier: number;
  raw: number;
  components: ScoreComponents;
  capped: boolean;
  evidenceHash: string;
  txHash: string;
  explanation: string;
}

export interface SwingEvent {
  type: string;
  agentId?: string;
  blockNumber: string;
  txHash: string;
  data: Record<string, unknown>;
}

export interface Health {
  ok: boolean;
  chainId: number;
  signer: string | null;
  dataSource: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => call<Health>("/health"),
  deployment: () => call<Record<string, string | number>>("/deployment"),
  agent: (id: string) => call<AgentState>(`/agents/${id}`),
  recompute: (id: string) => call<ScoreResult>(`/agents/${id}/recompute`, { method: "POST" }),
  earn: (id: string) => call<ScoreResult>(`/agents/${id}/earn`, { method: "POST" }),
  events: () => call<SwingEvent[]>("/events"),
  previewSpend: (body: { account: string; target: string; value?: string; data?: string }) =>
    call<{ reason: number; label: string }>("/preview-spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
};
