import type { EIP1193Provider } from "viem";
import { PUBLIC_RPC, sepolia } from "./config";
function unknownChain(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: number;
    data?: { originalError?: { code?: number } };
  };
  return e.code === 4902 || e.data?.originalError?.code === 4902;
}
/** Invoked only by an explicit network-switch control. Never retries a rejected request. */
export async function switchProviderToSepolia(
  provider: Pick<EIP1193Provider, "request">,
) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch (error) {
    if (!unknownChain(error)) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0xaa36a7",
          chainName: "Ethereum Sepolia",
          nativeCurrency: sepolia.nativeCurrency,
          rpcUrls: [PUBLIC_RPC],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
    // EIP-3085 does not require adding a network to switch to it. Ask once if still needed.
    const addedChain = await provider.request({ method: "eth_chainId" });
    if (BigInt(addedChain) !== BigInt(sepolia.id))
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
  }
  const active = await provider.request({ method: "eth_chainId" });
  if (BigInt(active) !== BigInt(sepolia.id))
    throw new Error(
      "Your wallet has not switched to Sepolia. Select Ethereum Sepolia in your wallet, then return.",
    );
}
