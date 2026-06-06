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

export interface TradeView {
  timestamp: number;
  pnl: number;
  win: boolean;
}

export interface TrackRecord {
  venue: string;
  trades: TradeView[];
  summary: {
    count: number;
    winRate: number;
    realizedPnl: number;
    sharpe: number;
    maxDrawdown: number;
    equity: number[];
  };
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
  session?: { trades: TradeView[]; realized: number };
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

export interface AgentSummary {
  agentId: string;
  reputation: Reputation;
  line: CreditLine;
}

export interface VaultStats {
  asset: string;
  totalAssets: string;
  totalBorrowed: string;
  available: string;
  utilizationBps: number;
}

export interface SpendOutcome {
  txHash: string;
  status: "success" | "reverted";
  ok: boolean;
  reason: number;
  label: string;
  to: string;
  amount: string;
  amountUsd: number;
}

export interface ByrealMarket {
  available: boolean;
  source?: string;
  chain?: string;
  version?: string;
  fetchedAt?: number;
  tvlUsd?: number;
  tvlChange24h?: number;
  volume24hUsd?: number;
  volumeChange24h?: number;
  fee24hUsd?: number;
  poolsCount?: number;
}

export interface OnboardResult {
  agentId: string;
  owner: string;
  score: number;
  tier: number;
  tierName: string;
  evidenceHash: string;
  txHash: string;
}

export interface OnchainTrade {
  timestamp: number;
  symbol: string;
  pnl: number;
  ret: number;
  win: boolean;
  hash: string;
}

export interface OnchainRecord {
  available: boolean;
  address?: string;
  explorer?: string;
  venue?: string;
  fetchedAt?: number;
  summary?: {
    swaps: number;
    closedTrades: number;
    realizedPnl: number;
    winRate: number;
    spanDays: number;
    openPositions: number;
  };
  trades?: OnchainTrade[];
  score?: { score: number; tier: number; tierName: string };
}

export interface OnchainCommit {
  score: number;
  tier: number;
  txHash: string;
  explanation: string;
  onchain: { address: string; summary: OnchainRecord["summary"] };
}

export interface X402Result {
  quote: {
    scheme: string;
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
  };
  settlement: { txHash: string; value: string };
  payload: {
    pair: string;
    bias: string;
    confidence: number;
    horizonHours: number;
    issuedBy: string;
    issuedAt: number;
  };
  prevScore: number;
  reputation: { score: number; commitTx: string };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => call<Health>("/health"),
  deployment: () => call<Record<string, string | number>>("/deployment"),
  agents: () => call<AgentSummary[]>("/agents"),
  vault: () => call<VaultStats>("/vault"),
  agent: (id: string) => call<AgentState>(`/agents/${id}`),
  track: (id: string) => call<TrackRecord>(`/agents/${id}/track`),
  recompute: (id: string) => call<ScoreResult>(`/agents/${id}/recompute`, { method: "POST" }),
  earn: (id: string) => call<ScoreResult>(`/agents/${id}/earn`, { method: "POST" }),
  events: () => call<SwingEvent[]>("/events"),
  previewSpend: (body: { account: string; target: string; value?: string; data?: string }) =>
    call<{ reason: number; label: string }>("/preview-spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  // Submit a REAL spend through the GuardedAccount; rogue/oversized mine as reverted txs.
  spend: (body: { account: string; to: string; amountUsd: number }) =>
    call<SpendOutcome>("/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  // Run the full x402 round-trip: 402 -> settle on Mantle -> redeem -> reputation feedback.
  x402Buy: (service: string) => call<X402Result>(`/x402/${service}/buy`, { method: "POST" }),
  // Live Byreal CLMM (Solana) market context via the Byreal Skills CLI.
  byrealMarket: () => call<ByrealMarket>("/byreal/market"),
  // Verified on-chain Mantle trading record (real DEX swaps) + the engine's derived score.
  onchain: () => call<OnchainRecord>("/onchain"),
  onchainCommit: (id: number) => call<OnchainCommit>(`/onchain/commit/${id}`, { method: "POST" }),
  // Operator onboarding: engine attests a starter reputation for the wallet's derived agent id.
  onboard: (owner: string) =>
    call<OnboardResult>("/onboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner }),
    }),
};
