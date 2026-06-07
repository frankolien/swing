/**
 * ERC-7579 spending guard on a real Kernel v3.1 smart account, via Pimlico (bundler + paymaster) on
 * Mantle Sepolia. The reusable core behind both the `aa-demo` CLI script and the engine's /aa/* API:
 * same SpendingGuardLib policy as the standalone GuardedAccount, now enforced on a modular account
 * whose gas is sponsored and whose UserOps flow through a real ERC-4337 bundler.
 *
 * Kernel v3.1 has no global hook, so the SpendingGuardHook is installed ATTACHED to the
 * SpendingGuardValidator (the agent session key drives the account; every spend it makes is metered
 * by the hook's preCheck). Both modules gate the same UserOp. All clients are built lazily so the
 * engine boots fine without a Pimlico key.
 */
import {
  createPublicClient,
  http,
  concat,
  decodeErrorResult,
  encodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  getAddress,
  pad,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepoliaTestnet } from "viem/chains";
import { entryPoint07Address, getUserOperationHash } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { mockUsdcAbi } from "@swing/shared/abis";
import {
  RPC_URL,
  PIMLICO_URL,
  PIMLICO_API_KEY,
  AA_OWNER_KEY,
  AGENT_SESSION_KEY,
  AA_ACCOUNT_INDEX,
  deployment,
} from "./config.js";

export const AA_EXPLORER = "https://explorer.sepolia.mantle.xyz";
const entryPoint = { address: entryPoint07Address, version: "0.7" } as const;
const USDC = (n: number) => BigInt(Math.round(n * 1e6)); // MockUSDC is 6-decimal
const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;

// EntryPoint v0.7 calls executeUserOp() (the only path that runs the validator's hook) when callData
// is prefixed with this selector. Kernel gates a non-root validator on the INNER execute selector
// (callData[4:8]) — that's what the install's selectorData permits.
const EXECUTE_USER_OP = toFunctionSelector(
  "executeUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32)"
);
const EXECUTE_SELECTOR = toFunctionSelector("execute(bytes32,bytes)");

// Spend policy installed into the hook: per-tx cap $2k, daily $5k, one allowlisted merchant.
const PER_TX_CAP = USDC(2_000);
const DAILY_LIMIT = USDC(5_000);

const guardErrors = [
  { type: "error", name: "Frozen", inputs: [] },
  { type: "error", name: "DestinationNotAllowed", inputs: [{ name: "dest", type: "address" }] },
  { type: "error", name: "PerTxCapExceeded", inputs: [{ name: "cap", type: "uint256" }, { name: "amount", type: "uint256" }] },
  { type: "error", name: "DailyLimitExceeded", inputs: [{ name: "limit", type: "uint256" }, { name: "windowSpent", type: "uint256" }, { name: "amount", type: "uint256" }] },
] as const;

const kernelAbi = [
  { type: "function", name: "installModule", stateMutability: "payable", outputs: [], inputs: [{ name: "moduleType", type: "uint256" }, { name: "module", type: "address" }, { name: "initData", type: "bytes" }] },
  { type: "function", name: "isModuleInstalled", stateMutability: "view", outputs: [{ type: "bool" }], inputs: [{ name: "moduleType", type: "uint256" }, { name: "module", type: "address" }, { name: "additionalContext", type: "bytes" }] },
] as const;

const configOfAbi = [
  { type: "function", name: "configOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ name: "perTxCap", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "frozen", type: "bool" }] },
] as const;

const entryPointNonceAbi = [
  { type: "function", name: "getNonce", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint192" }], outputs: [{ type: "uint256" }] },
] as const;

/** Decode a refused spend's revert reason into the guard's typed error, in plain words. */
function decodeGuardRevert(e: unknown): string {
  const txt = String((e as { details?: string })?.details ?? (e as { shortMessage?: string })?.shortMessage ?? (e as { message?: string })?.message ?? e);
  const raw = txt.match(/0x[0-9a-fA-F]{8,}/)?.[0] as Hex | undefined;
  if (raw) {
    try {
      const d = decodeErrorResult({ abi: guardErrors, data: raw });
      const args = (d.args ?? []).map((a) => (typeof a === "bigint" ? `$${Number(a) / 1e6}` : String(a)));
      return `${d.errorName}(${args.join(", ")})`;
    } catch {
      /* not a guard error — fall through to the raw message */
    }
  }
  return txt.split("\n")[0] ?? txt;
}

export function aaReady(): { ready: boolean; reason: string } {
  if (!PIMLICO_API_KEY || !PIMLICO_URL) return { ready: false, reason: "PIMLICO_API_KEY not set (free at dashboard.pimlico.io)" };
  if (!AA_OWNER_KEY) return { ready: false, reason: "AA owner key not set (AA_OWNER_PRIVATE_KEY / deployer key)" };
  return { ready: true, reason: "" };
}

// ── lazy singleton context (only built once a Pimlico key is present) ───────────────────────────
type Ctx = {
  publicClient: ReturnType<typeof createPublicClient>;
  pimlico: ReturnType<typeof createPimlicoClient>;
  smart: ReturnType<typeof createSmartAccountClient>;
  account: Awaited<ReturnType<typeof toKernelSmartAccount>>;
  ownerAccount: ReturnType<typeof privateKeyToAccount>;
  agentAccount: ReturnType<typeof privateKeyToAccount>;
  usdc: Address;
  validator: Address;
  hook: Address;
  merchant: Address;
  nonceKey: bigint;
};
let _ctx: Ctx | null = null;

async function ctx(): Promise<Ctx> {
  if (_ctx) return _ctx;
  const r = aaReady();
  if (!r.ready) throw new Error(r.reason);
  const ownerAccount = privateKeyToAccount(AA_OWNER_KEY);
  const agentAccount = privateKeyToAccount(AGENT_SESSION_KEY); // authorized by the validator; signs spends
  const transport = http(RPC_URL, { batch: false, retryCount: 10, retryDelay: 600, timeout: 25_000 });
  const publicClient = createPublicClient({ chain: mantleSepoliaTestnet, transport });
  const pimlico = createPimlicoClient({ transport: http(PIMLICO_URL), entryPoint });
  const account = await toKernelSmartAccount({ client: publicClient, owners: [ownerAccount], version: "0.3.1", entryPoint, index: AA_ACCOUNT_INDEX });
  const smart = createSmartAccountClient({
    account,
    chain: mantleSepoliaTestnet,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlico,
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  });
  const validator = getAddress(deployment.SpendingGuardValidator);
  const hook = getAddress(deployment.SpendingGuardHook);
  // Route a UserOp to OUR validator: Kernel nonce key = [mode 0x00][vType 0x01=VALIDATOR][validator 20b].
  const nonceKey = BigInt(pad(encodePacked(["bytes1", "bytes1", "address"], ["0x00", "0x01", validator]), { dir: "right", size: 24 }));
  _ctx = {
    publicClient,
    pimlico,
    smart,
    account,
    ownerAccount,
    agentAccount,
    usdc: getAddress(deployment.MockUSDC),
    validator,
    hook,
    merchant: ownerAccount.address,
    nonceKey,
  };
  return _ctx;
}

const usdcBalance = (c: Ctx, who: Address) =>
  c.publicClient.readContract({ address: c.usdc, abi: mockUsdcAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;

const isValidatorInstalled = (c: Ctx) =>
  c.publicClient
    .readContract({ address: c.account.address, abi: kernelAbi, functionName: "isModuleInstalled", args: [1n, c.validator, "0x"] })
    .catch(() => false) as Promise<boolean>;

/** Owner-signed sponsored UserOp (used for funding + module install). Returns the mined tx hash. */
async function sponsored(c: Ctx, calls: { to: Address; data: Hex; value?: bigint }[]): Promise<Hex> {
  const userOpHash = await (c.smart as any).sendUserOperation({ calls });
  const r = await (c.smart as any).waitForUserOperationReceipt({ hash: userOpHash });
  return r.receipt.transactionHash as Hex;
}

/** Kernel v3.1 validator-with-hook install data: hook(20b) ++ abi.encode(validatorData, hookData, selectorData). */
function buildInstallData(c: Ctx): Hex {
  const validatorInitData = encodeAbiParameters([{ type: "address" }], [c.agentAccount.address]);
  const hookPolicy = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "address[]" }],
    [PER_TX_CAP, DAILY_LIMIT, [c.merchant]]
  );
  // _installHook slices a leading flag byte — prepend 0xff or the policy bytes get corrupted.
  const hookInitData = encodePacked(["bytes1", "bytes"], ["0xff", hookPolicy]);
  return encodePacked(
    ["address", "bytes"],
    [c.hook, encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }, { type: "bytes" }], [validatorInitData, hookInitData, EXECUTE_SELECTOR])]
  );
}

export interface AaState {
  ready: boolean;
  reason: string;
  explorer: string;
  account?: Address;
  deployed?: boolean;
  owner?: Address;
  agent?: Address;
  validator?: Address;
  hook?: Address;
  validatorInstalled?: boolean;
  balanceUsd?: number;
  policy?: { perTxCapUsd: number; dailyLimitUsd: number; frozen: boolean; merchant: Address };
}

/** Read-only snapshot of the AA account + installed policy. */
export async function aaState(): Promise<AaState> {
  const r = aaReady();
  if (!r.ready) return { ready: false, reason: r.reason, explorer: AA_EXPLORER };
  const c = await ctx();
  const [code, installed, bal] = await Promise.all([
    c.publicClient.getCode({ address: c.account.address }),
    isValidatorInstalled(c),
    usdcBalance(c, c.account.address),
  ]);
  let policy: AaState["policy"] | undefined;
  if (installed) {
    const cfg = (await c.publicClient.readContract({ address: c.hook, abi: configOfAbi, functionName: "configOf", args: [c.account.address] })) as readonly [bigint, bigint, boolean];
    policy = { perTxCapUsd: Number(cfg[0]) / 1e6, dailyLimitUsd: Number(cfg[1]) / 1e6, frozen: cfg[2], merchant: c.merchant };
  }
  return {
    ready: true,
    reason: "",
    explorer: AA_EXPLORER,
    account: c.account.address,
    deployed: Boolean(code && code !== "0x"),
    owner: c.ownerAccount.address,
    agent: c.agentAccount.address,
    validator: c.validator,
    hook: c.hook,
    validatorInstalled: installed,
    balanceUsd: Number(bal) / 1e6,
    policy,
  };
}

/** Idempotently deploy + fund + install the guard modules (sponsored). Returns the new state + txs. */
export async function aaPrepare(): Promise<{ state: AaState; mintedTx?: Hex; installedTx?: Hex }> {
  const r = aaReady();
  if (!r.ready) return { state: { ready: false, reason: r.reason, explorer: AA_EXPLORER } };
  const c = await ctx();
  let mintedTx: Hex | undefined;
  let installedTx: Hex | undefined;

  const bal = await usdcBalance(c, c.account.address);
  if (bal < USDC(1_500)) {
    mintedTx = await sponsored(c, [{ to: c.usdc, data: encodeFunctionData({ abi: mockUsdcAbi, functionName: "mint", args: [c.account.address, USDC(5_000)] }) }]);
  }
  if (!(await isValidatorInstalled(c))) {
    installedTx = await sponsored(c, [{ to: c.account.address, data: encodeFunctionData({ abi: kernelAbi, functionName: "installModule", args: [1n, c.validator, buildInstallData(c)] }) }]);
  }
  return { state: await aaState(), mintedTx, installedTx };
}

export type AaSpendKind = "allowed" | "rogueDest" | "rogueCap";

export interface AaSpendResult {
  kind: AaSpendKind;
  label: string;
  to: Address;
  amountUsd: number;
  outcome: "mined" | "refused";
  txHash?: Hex;
  explorerTx?: string;
  reason?: string;
}

function spendParams(c: Ctx, kind: AaSpendKind): { to: Address; amountUsd: number; label: string } {
  switch (kind) {
    case "allowed":
      return { to: c.merchant, amountUsd: 1_000, label: "Allowed — allowlisted merchant, in bounds" };
    case "rogueDest":
      return { to: DEAD, amountUsd: 1_000, label: "Rogue — destination not allowlisted" };
    case "rogueCap":
      return { to: c.merchant, amountUsd: 3_000, label: "Rogue — over the $2k per-tx cap" };
  }
}

/**
 * Run one spend as a sponsored UserOp routed THROUGH the SpendingGuardValidator (so its hook fires).
 * Allowed → mines; rogue → the hook's preCheck reverts and the bundler refuses to include it.
 */
export async function aaSpend(kind: AaSpendKind): Promise<AaSpendResult> {
  const c = await ctx();
  const { to, amountUsd, label } = spendParams(c, kind);
  const amount = USDC(amountUsd);

  // Keep the allowed path repeatable: top up if the account can't cover the transfer (sponsored).
  if (kind === "allowed" && (await usdcBalance(c, c.account.address)) < amount) {
    await sponsored(c, [{ to: c.usdc, data: encodeFunctionData({ abi: mockUsdcAbi, functionName: "mint", args: [c.account.address, USDC(5_000)] }) }]);
  }

  const transferData = encodeFunctionData({ abi: mockUsdcAbi, functionName: "transfer", args: [to, amount] });
  try {
    const nonce = (await c.publicClient.readContract({ address: entryPoint07Address, abi: entryPointNonceAbi, functionName: "getNonce", args: [c.account.address, c.nonceKey] })) as bigint;
    const fees = (await (c.pimlico as any).getUserOperationGasPrice()).fast;
    const inner = await c.account.encodeCalls([{ to: c.usdc, value: 0n, data: transferData }]); // usdc.transfer(to, amount)
    const op = await (c.smart as any).prepareUserOperation({
      callData: concat([EXECUTE_USER_OP, inner]), // executeUserOp ‖ execute(...) → Kernel runs the hook
      nonce,
      callGasLimit: 500_000n,
      verificationGasLimit: 700_000n,
      preVerificationGas: 2_000_000n, // Mantle L2 — generous; sponsored, so over-provisioning is free
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const userOpHash = getUserOperationHash({ userOperation: op, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", chainId: mantleSepoliaTestnet.id });
    op.signature = await c.agentAccount.signMessage({ message: { raw: userOpHash } });
    const sent = await (c.smart as any).sendUserOperation(op);
    const receipt = await (c.smart as any).waitForUserOperationReceipt({ hash: sent });
    const txHash = receipt.receipt.transactionHash as Hex;
    return { kind, label, to, amountUsd, outcome: receipt.success ? "mined" : "refused", txHash, explorerTx: `${AA_EXPLORER}/tx/${txHash}`, reason: receipt.success ? undefined : "reverted on-chain" };
  } catch (e) {
    return { kind, label, to, amountUsd, outcome: "refused", reason: decodeGuardRevert(e) };
  }
}
