import { createConfig, http } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Client-side wallet config. Single chain (Mantle Sepolia) + the injected connector
// (MetaMask/Rabby/Brave/etc.) — no WalletConnect projectId needed for the demo.
export const wagmiConfig = createConfig({
  chains: [mantleSepoliaTestnet],
  connectors: [injected()],
  transports: {
    [mantleSepoliaTestnet.id]: http("https://rpc.sepolia.mantle.xyz"),
  },
});

export const MANTLE_SEPOLIA = mantleSepoliaTestnet;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
