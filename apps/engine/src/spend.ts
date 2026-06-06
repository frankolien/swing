import { encodeFunctionData, type Address } from "viem";
import { guardedAccountAbi, mockUsdcAbi } from "@swing/shared/abis";
import { walletClient, publicClient, account, usdc, mantleSepoliaTestnet } from "./chain.js";

export interface SpendOutcome {
  txHash: `0x${string}`;
  status: "success" | "reverted";
  to: Address;
  amount: string; // base units (6-decimal)
  reason: number; // SpendingGuardLib preview reason (0 = allowed)
}

const transferData = (to: Address, amount: bigint) =>
  encodeFunctionData({ abi: mockUsdcAbi, functionName: "transfer", args: [to, amount] });

/// Submit a REAL spend through the agent's GuardedAccount and return its mined outcome.
///
/// The whole point: a policy-breaching spend must land on-chain as a *reverted* transaction
/// (status 0), not be swallowed client-side. viem's writeContract runs eth_estimateGas first,
/// which itself reverts for a guarded spend and would throw before broadcasting — so we pass an
/// explicit `gas` to skip estimation. The tx then mines with status "reverted", carrying the
/// guard's typed error: that receipt is the on-chain proof the demo is built on.
export async function executeSpend(opts: {
  accountAddr: Address;
  to: Address;
  amount: bigint;
  ensureFunds?: boolean;
}): Promise<SpendOutcome> {
  if (!walletClient || !account) {
    throw new Error("no signer configured (set ORACLE_SIGNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY)");
  }
  const { accountAddr, to, amount } = opts;
  const data = transferData(to, amount);

  // Off-chain pre-flight: the reason code drives the human label and tells us whether this is
  // an allowed spend that might still need funding.
  const reason = Number(
    await publicClient.readContract({
      address: accountAddr,
      abi: guardedAccountAbi,
      functionName: "previewSpend",
      args: [usdc.address, 0n, data],
    })
  );

  // Keep the "allowed -> executes" contrast repeatable: if policy would pass but the account
  // can't cover the transfer, mint it some test USDC first (MockUSDC has an open faucet mint).
  if (opts.ensureFunds && reason === 0) {
    const bal = (await usdc.read.balanceOf([accountAddr])) as bigint;
    if (bal < amount) {
      const mintHash = await walletClient.writeContract({
        address: usdc.address,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [accountAddr, amount * 10n],
        account,
        chain: mantleSepoliaTestnet,
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
    }
  }

  const txHash = await walletClient.writeContract({
    address: accountAddr,
    abi: guardedAccountAbi,
    functionName: "execute",
    args: [usdc.address, 0n, data],
    account,
    chain: mantleSepoliaTestnet,
    gas: 300_000n, // explicit -> skip estimateGas so a guarded revert actually mines
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash, status: receipt.status, to, amount: amount.toString(), reason };
}
