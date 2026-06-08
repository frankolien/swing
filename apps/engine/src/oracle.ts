import { reputationOracleAbi } from "@swing/shared/abis";
import { computeScore, type ScoreInputs, type ScoreResult } from "./scoring.js";
import {
  oracle,
  walletClient,
  publicClient,
  account,
  committeeAccounts,
  mantleSepoliaTestnet,
} from "./chain.js";

// Minimal ABI for the k-of-n committee oracle. Kept local (not in the generated shared ABI) so
// the engine still talks to the currently-deployed single-signer oracle via the legacy path
// below — auto-detected at runtime. Once the committee oracle is deployed + `gen-abis` is run,
// this can be folded into the shared ABI.
const committeeAbi = [
  {
    type: "function",
    name: "threshold",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commitDigest",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "uint16" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commit",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "uint16" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "signatures", type: "bytes[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Detect whether the deployed oracle is a committee (has `threshold()`) or the legacy
// single-signer contract. Cached after the first probe.
let committeeMode: boolean | undefined;
async function isCommittee(): Promise<boolean> {
  if (committeeMode !== undefined) return committeeMode;
  try {
    await publicClient.readContract({
      address: oracle.address,
      abi: committeeAbi,
      functionName: "threshold",
    });
    committeeMode = true;
  } catch {
    committeeMode = false;
  }
  return committeeMode;
}

/// Submit a reputation commit, transparently using the committee (threshold-signature) path or
/// the legacy single-signer path depending on the deployed oracle. The submitter (gas payer) is
/// the engine `account`; in committee mode the authority comes from the signatures, not the sender.
async function submitCommit(
  agentId: bigint,
  score: number,
  evidenceHash: `0x${string}`
): Promise<`0x${string}`> {
  if (!walletClient || !account) {
    throw new Error("no signer configured (set ORACLE_SIGNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY)");
  }

  if (await isCommittee()) {
    if (committeeAccounts.length === 0) {
      throw new Error("committee oracle requires ORACLE_SIGNER_KEYS (or ORACLE_SIGNER_PRIVATE_KEY)");
    }
    // Ask the contract for the exact digest (binds chainId + oracle + agent's next epoch), then
    // sign it with each committee key and order the signatures by ascending signer address.
    const digest = (await publicClient.readContract({
      address: oracle.address,
      abi: committeeAbi,
      functionName: "commitDigest",
      args: [agentId, score, evidenceHash],
    })) as `0x${string}`;

    const signed = await Promise.all(
      committeeAccounts.map(async (a) => ({
        addr: a.address.toLowerCase(),
        sig: await a.signMessage({ message: { raw: digest } }),
      }))
    );
    signed.sort((x, y) => (x.addr < y.addr ? -1 : x.addr > y.addr ? 1 : 0));
    const signatures = signed.map((s) => s.sig);

    const txHash = await walletClient.writeContract({
      address: oracle.address,
      abi: committeeAbi,
      functionName: "commit",
      args: [agentId, score, evidenceHash, signatures],
      account,
      chain: mantleSepoliaTestnet,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  // legacy single-signer oracle (the currently-deployed contract)
  const txHash = await walletClient.writeContract({
    address: oracle.address,
    abi: reputationOracleAbi,
    functionName: "commit",
    args: [agentId, score, evidenceHash],
    account,
    chain: mantleSepoliaTestnet,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/// Score off-chain, then commit the result on-chain. `evidenceHash` binds the commit to its
/// inputs so anyone can recompute and audit — the verifiability story.
export async function commitScore(
  agentId: bigint,
  inputs: ScoreInputs
): Promise<{ result: ScoreResult; txHash: `0x${string}` }> {
  const result = computeScore(inputs);
  const txHash = await submitCommit(agentId, result.score, result.evidenceHash);
  return { result, txHash };
}

/// Commit an explicit score + evidence hash (used by operator onboarding to attest a starter
/// reputation for a freshly-launched agent). Same committee/quorum gate as commitScore.
export async function commitRaw(
  agentId: bigint,
  score: number,
  evidenceHash: `0x${string}`
): Promise<`0x${string}`> {
  return submitCommit(agentId, score, evidenceHash);
}
