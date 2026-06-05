import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";
import {
  reputationOracleAbi,
  creditManagerAbi,
  creditVaultAbi,
  spendingGuardHookAbi,
  guardedAccountAbi,
  mockUsdcAbi,
} from "@swing/shared/abis";
import { RPC_URL, SIGNER_KEY, deployment } from "./config.js";

// batch:false is deliberate — the public Mantle RPC refuses viem's default concurrent
// batched requests (same failure that breaks `forge script`'s fork backend). Sequential
// calls with generous retries are reliable.
const transport = http(RPC_URL, {
  batch: false,
  retryCount: 10,
  retryDelay: 600,
  timeout: 25_000,
});

export const publicClient = createPublicClient({ chain: mantleSepoliaTestnet, transport });

export const account = SIGNER_KEY ? privateKeyToAccount(SIGNER_KEY) : undefined;
export const walletClient = account
  ? createWalletClient({ account, chain: mantleSepoliaTestnet, transport })
  : undefined;

export const addresses = deployment;

export const oracle = getContract({
  address: deployment.ReputationOracle as Address,
  abi: reputationOracleAbi,
  client: publicClient,
});

export const manager = getContract({
  address: deployment.CreditManager as Address,
  abi: creditManagerAbi,
  client: publicClient,
});

export const vault = getContract({
  address: deployment.CreditVault as Address,
  abi: creditVaultAbi,
  client: publicClient,
});

export const hook = getContract({
  address: deployment.SpendingGuardHook as Address,
  abi: spendingGuardHookAbi,
  client: publicClient,
});

export const usdc = getContract({
  address: deployment.MockUSDC as Address,
  abi: mockUsdcAbi,
  client: publicClient,
});

export const guardedAccountAt = (address: Address) =>
  getContract({ address, abi: guardedAccountAbi, client: publicClient });

export { mantleSepoliaTestnet };
