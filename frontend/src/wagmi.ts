import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { genLayerAsimov, GENLAYER_RPC_URL } from "./chain";

const connectors = connectorsForWallets(
  [{ groupName: "Installed", wallets: [injectedWallet] }],
  { appName: "CardLedger", projectId: "gift-refund" }
);

export const config = createConfig({
  connectors,
  chains: [genLayerAsimov],
  transports: { [genLayerAsimov.id]: http(GENLAYER_RPC_URL) },
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
