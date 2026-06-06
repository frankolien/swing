// Minimal wagmi/viem-typed ABIs for the wallet-signed flows. Kept inline (not the full generated
// ABIs) so the flows are self-contained and the types infer cleanly.

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

export const vaultAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "redeem", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxWithdraw", stateMutability: "view", inputs: [{ name: "o", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "previewDeposit", stateMutability: "view", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// SpendingGuardLib.Config tuple — perTxCap, dailyLimit, frozen.
const configTuple = {
  name: "cfg",
  type: "tuple",
  components: [
    { name: "perTxCap", type: "uint256" },
    { name: "dailyLimit", type: "uint256" },
    { name: "frozen", type: "bool" },
  ],
} as const;

export const factoryAbi = [
  { type: "function", name: "createAccount", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "owner", type: "address" }, { name: "agent", type: "address" }, configTuple], outputs: [{ name: "account", type: "address" }] },
  { type: "function", name: "predict", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }, { name: "owner", type: "address" }, { name: "agent", type: "address" }, configTuple], outputs: [{ type: "address" }] },
] as const;

export const managerAbi = [
  { type: "function", name: "openLine", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "account", type: "address" }], outputs: [] },
  { type: "function", name: "draw", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "borrowingPower", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "getLine", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "account", type: "address" }, { name: "tier", type: "uint8" }, { name: "aprBps", type: "uint16" },
        { name: "liquidated", type: "bool" }, { name: "openedAt", type: "uint64" }, { name: "lastAccruedAt", type: "uint64" },
        { name: "limit", type: "uint256" }, { name: "principal", type: "uint256" }, { name: "interestAccrued", type: "uint256" }, { name: "collateral", type: "uint256" },
      ],
    }],
  },
] as const;

export const oracleAbi = [
  { type: "function", name: "scoreOf", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint16" }] },
  { type: "function", name: "tierOf", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint8" }] },
] as const;
