import { defineChain } from "viem";

// GenLayer Asimov Testnet — where the CardLedger contract is deployed. Values
// come from the committed .env (see .env.example); the fallbacks keep the
// deployed address and network fixed if a build runs without an env file.
export const GENLAYER_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 4221);
export const GENLAYER_RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://rpc-asimov.genlayer.com";
export const GENLAYER_NETWORK = "testnetAsimov" as const;

// gift-refund (CardLedger) — deployed on testnet-asimov.
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ??
  "0xA2d67Df68a3da99dAB238589aA7D35D491F4DB8F") as `0x${string}`;

export const genLayerAsimov = defineChain({
  id: GENLAYER_CHAIN_ID,
  name: "GenLayer Asimov Testnet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [GENLAYER_RPC_URL] }, public: { http: [GENLAYER_RPC_URL] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer-asimov.genlayer.com" } },
  testnet: true,
});
