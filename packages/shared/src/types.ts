import type { TierId } from "./tiers";

/** Mirror of SpendingGuardLib reason codes (the order `enforce` reverts in). */
export enum SpendReason {
  Ok = 0,
  Frozen = 1,
  DestinationNotAllowed = 2,
  PerTxCapExceeded = 3,
  DailyLimitExceeded = 4,
}

export const SPEND_REASON_LABEL: Record<SpendReason, string> = {
  [SpendReason.Ok]: "Allowed",
  [SpendReason.Frozen]: "Account frozen",
  [SpendReason.DestinationNotAllowed]: "Destination not allowlisted",
  [SpendReason.PerTxCapExceeded]: "Per-tx cap exceeded",
  [SpendReason.DailyLimitExceeded]: "Daily limit exceeded",
};

/** Mirror of ReputationOracle.Reputation. */
export interface Reputation {
  score: number; // 0..1000
  tier: TierId;
  updatedAt: number; // unix seconds
  epoch: number;
  evidenceHash: `0x${string}`;
}

/** Mirror of CreditManager.Line (base units = 6-decimal USDC). */
export interface CreditLine {
  account: `0x${string}`;
  tier: TierId;
  aprBps: number;
  liquidated: boolean;
  openedAt: number;
  lastAccruedAt: number;
  limit: bigint;
  principal: bigint;
  interestAccrued: bigint;
  collateral: bigint;
}

/** the swing deployment record (written by contracts/script/Deploy.s.sol). */
export interface SwingDeployment {
  chainId: number;
  MockUSDC: `0x${string}`;
  ReputationOracle: `0x${string}`;
  CreditVault: `0x${string}`;
  CreditManager: `0x${string}`;
  GuardedAccountFactory: `0x${string}`;
  SpendingGuardHook: `0x${string}`;
  SpendingGuardValidator: `0x${string}`;
}
