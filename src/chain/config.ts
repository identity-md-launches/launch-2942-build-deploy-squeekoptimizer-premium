import { createConfig, http as wagmiHttp } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { createPublicClient, fallback, getAddress, http } from "viem";
import { sepolia } from "viem/chains";
import deployment from "./deployment.json";
export { abi as coreAbi } from "./abi/SqueekCore";
export { abi as miningAbi } from "./abi/SqueekMining";
export { abi as nftAbi } from "./abi/SqueekNFT";
export { abi as tokenAbi } from "./abi/SqueekToken";
export { deployment, sepolia };
export const ADDRESSES = {
  core: getAddress(deployment.contracts.SqueekCore.address),
  mining: getAddress(deployment.contracts.SqueekMining.address),
  nft: getAddress(deployment.contracts.SqueekNFT.address),
  token: getAddress(deployment.contracts.SqueekToken.address),
} as const;
export const PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";
export const FIRST_BLOCK = BigInt(deployment.deploymentBlock);
export function makeClient(customRpc?: string) {
  return createPublicClient({
    chain: sepolia,
    transport: customRpc
      ? http(customRpc, { timeout: 18_000, retryCount: 0 })
      : fallback(
          [
            http(PUBLIC_RPC, { timeout: 15_000, retryCount: 0 }),
            http("https://sepolia.gateway.tenderly.co", {
              timeout: 15_000,
              retryCount: 0,
            }),
            http("https://sepolia.drpc.org", {
              timeout: 15_000,
              retryCount: 0,
            }),
          ],
          { retryCount: 0 },
        ),
  });
}
export type ReadClient = ReturnType<typeof makeClient>;
export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({ appName: "SqueekOptimizer", preference: "all" }),
  ],
  transports: { [sepolia.id]: wagmiHttp(PUBLIC_RPC) },
});
