import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { EIP1193Provider } from "viem";
import { switchProviderToSepolia } from "../chain/switchNetwork";
import { sepolia } from "../chain/config";
export function useSepoliaSwitch() {
  const { connector } = useAccount();
  const [isPending, setPending] = useState(false);
  const busy = useRef(false);
  async function switchChainAsync({ chainId }: { chainId: number }) {
    if (chainId !== sepolia.id)
      throw new Error("Only Ethereum Sepolia is supported.");
    if (busy.current) return;
    if (!connector)
      throw new Error("Connect a wallet before switching networks.");
    busy.current = true;
    setPending(true);
    try {
      const provider = (await connector.getProvider()) as
        EIP1193Provider | undefined;
      if (!provider?.request)
        throw new Error(
          "This wallet cannot switch networks here. Select Ethereum Sepolia in the wallet itself.",
        );
      await switchProviderToSepolia(provider);
      // Some wallets omit chainChanged. Only synchronize wagmi after eth_chainId verifies it.
      connector.emitter.emit("change", { chainId: sepolia.id });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { switchChainAsync, isPending };
}
