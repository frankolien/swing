/** Mantle network + ERC-8004 singleton config. VERIFY addresses on-chain before trusting. */

export interface NetworkConfig {
  id: number;
  name: string;
  rpc: string;
  explorer: string;
  faucet?: string;
  nativeToken: string;
}

export const MANTLE_SEPOLIA: NetworkConfig = {
  id: 5003,
  name: "Mantle Sepolia",
  rpc: "https://rpc.sepolia.mantle.xyz",
  explorer: "https://explorer.sepolia.mantle.xyz",
  faucet: "https://faucet.sepolia.mantle.xyz",
  nativeToken: "MNT",
};

export const MANTLE_MAINNET: NetworkConfig = {
  id: 5000,
  name: "Mantle",
  rpc: "https://rpc.mantle.xyz",
  explorer: "https://explorer.mantle.xyz",
  nativeToken: "MNT",
};

export const NETWORKS: Record<number, NetworkConfig> = {
  [MANTLE_SEPOLIA.id]: MANTLE_SEPOLIA,
  [MANTLE_MAINNET.id]: MANTLE_MAINNET,
};

/** ERC-8004 canonical per-chain singletons (vanity addresses). Re-verify before trusting. */
export interface Erc8004Registries {
  identity: `0x${string}`;
  reputation: `0x${string}`;
}

export const ERC8004: Record<number, Erc8004Registries> = {
  5003: {
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  5000: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
};

export const explorerTx = (chainId: number, hash: string): string =>
  `${NETWORKS[chainId]?.explorer ?? ""}/tx/${hash}`;

export const explorerAddress = (chainId: number, addr: string): string =>
  `${NETWORKS[chainId]?.explorer ?? ""}/address/${addr}`;
