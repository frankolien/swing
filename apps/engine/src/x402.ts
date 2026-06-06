import { parseEventLogs, type Address, type Hex } from "viem";
import { mockUsdcAbi } from "@swing/shared/abis";
import { walletClient, publicClient, account, usdc, mantleSepoliaTestnet } from "./chain.js";

// A faithful-enough x402 over Mantle. We speak the protocol's HTTP shape (402 + an `accepts`
// array of payment requirements; the buyer retries with an `X-PAYMENT` header; the server
// answers with `X-PAYMENT-RESPONSE`), and run our own *mock facilitator*: settlement is a real
// USDC transfer on Mantle Sepolia, verified on-chain from its Transfer log. The redeemed
// proof-of-payment then loops back into the provider's ERC-8004 reputation (see api.ts).
export const X402_VERSION = 1;
const NETWORK = "mantle-sepolia" as const;

export interface PaymentRequirements {
  scheme: "exact";
  network: typeof NETWORK;
  asset: Address;
  payTo: Address;
  maxAmountRequired: string; // base units (6-decimal USDC)
  resource: string;
  description: string;
  mimeType: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  priceUsd: number;
  providerAgentId: number;
}

export const SERVICES: Record<string, Service> = {
  "alpha-signal": {
    id: "alpha-signal",
    title: "Momentum alpha signal",
    description: "An agent's current MNT/USDC directional read, sold per call over x402.",
    priceUsd: 5,
    providerAgentId: 1,
  },
};

/// The resource delivered once payment is verified — what the buyer actually pays for.
export function signalPayload(now: number) {
  return {
    pair: "MNT/USDC",
    bias: "long",
    confidence: 0.78,
    horizonHours: 4,
    issuedBy: "agent #1",
    issuedAt: now,
  };
}

export function requirements(svc: Service, payTo: Address, resource: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: usdc.address,
    payTo,
    maxAmountRequired: BigInt(Math.round(svc.priceUsd * 1e6)).toString(),
    resource,
    description: svc.title,
    mimeType: "application/json",
  };
}

const b64 = {
  encode: (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64"),
  decode: <T>(s: string): T | null => {
    try {
      return JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;
    } catch {
      return null;
    }
  },
};

export const encodeToken = (o: { txHash: Hex }) => b64.encode(o);
export const encodeSettlement = (o: { txHash: Hex; payTo: Address; amount: string }) => b64.encode(o);

// Each settlement tx can be redeemed once — replay protection for the X-PAYMENT proof.
const consumed = new Set<string>();

/// Mock-facilitator settlement: the buyer agent (the engine signer) pays the provider on-chain.
export async function settle(payTo: Address, amount: bigint): Promise<{ txHash: Hex; value: string }> {
  if (!walletClient || !account) throw new Error("no signer configured");
  const bal = (await usdc.read.balanceOf([account.address])) as bigint;
  if (bal < amount) {
    const mintHash = await walletClient.writeContract({
      address: usdc.address,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [account.address, amount * 100n],
      account,
      chain: mantleSepoliaTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
  }
  const txHash = await walletClient.writeContract({
    address: usdc.address,
    abi: mockUsdcAbi,
    functionName: "transfer",
    args: [payTo, amount],
    account,
    chain: mantleSepoliaTestnet,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, value: amount.toString() };
}

export interface VerifyResult {
  ok: boolean;
  txHash?: Hex;
  value?: string;
  reason?: string;
}

/// Verify an X-PAYMENT proof on-chain: the settlement tx must be mined-successful and carry a
/// USDC Transfer to `payTo` of at least the required amount, and must not have been redeemed before.
export async function verify(header: string, req: PaymentRequirements): Promise<VerifyResult> {
  const token = b64.decode<{ txHash: Hex }>(header);
  if (!token?.txHash) return { ok: false, reason: "malformed X-PAYMENT" };
  if (consumed.has(token.txHash.toLowerCase())) return { ok: false, reason: "payment already redeemed" };

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: token.txHash });
  } catch {
    return { ok: false, reason: "settlement tx not found" };
  }
  if (receipt.status !== "success") return { ok: false, reason: "settlement reverted" };

  const required = BigInt(req.maxAmountRequired);
  const transfers = parseEventLogs({ abi: mockUsdcAbi, logs: receipt.logs, eventName: "Transfer" });
  const paid = transfers.find((l) => {
    const a = l.args as { to?: string; value?: bigint };
    return a.to?.toLowerCase() === req.payTo.toLowerCase() && (a.value ?? 0n) >= required;
  });
  if (!paid) return { ok: false, reason: "no qualifying payment to payTo" };

  consumed.add(token.txHash.toLowerCase());
  return { ok: true, txHash: token.txHash, value: required.toString() };
}
