import { reputationOracleAbi } from "@swing/shared/abis";
import { computeScore, type ScoreInputs, type ScoreResult } from "./scoring.js";
import { oracle, walletClient, publicClient, account, mantleSepoliaTestnet } from "./chain.js";

/// Score off-chain, then commit the result on-chain. `evidenceHash` binds the commit to its
/// inputs so anyone can recompute and audit — the verifiability story.
export async function commitScore(
  agentId: bigint,
  inputs: ScoreInputs
): Promise<{ result: ScoreResult; txHash: `0x${string}` }> {
  if (!walletClient || !account) {
    throw new Error("no signer configured (set ORACLE_SIGNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY)");
  }
  const result = computeScore(inputs);
  const txHash = await walletClient.writeContract({
    address: oracle.address,
    abi: reputationOracleAbi,
    functionName: "commit",
    args: [agentId, result.score, result.evidenceHash],
    account,
    chain: mantleSepoliaTestnet,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { result, txHash };
}
