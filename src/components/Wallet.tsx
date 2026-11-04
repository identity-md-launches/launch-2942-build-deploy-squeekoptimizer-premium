import { useSepoliaSwitch } from "../lib/useSepoliaSwitch";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useAccount,
  useConnect,
  useConnections,
  useDisconnect,
  type Connector,
} from "wagmi";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Wallet,
} from "lucide-react";
import { Modal } from "./Modal";
import { amount, errorMessage, shortAddress } from "../lib/format";
import { EXPLORER, sepolia } from "../chain/config";
const WalletContext = createContext<() => void>(() => {});
export const useOpenWallet = () => useContext(WalletContext);
const coinbaseMark =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#2c5ff6"/><circle cx="14" cy="14" r="10" fill="white"/><rect x="10" y="10" width="8" height="8" rx="1" fill="#2c5ff6"/></svg>',
  );
const OPEN_IN = [
  {
    name: "MetaMask",
    icon: "metaMaskWallet",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    name: "Coinbase Wallet",
    icon: "",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    name: "Rabby",
    icon: "rabbyWallet",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    name: "Phantom",
    icon: "phantomWallet",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export function WalletProvider({
  children,
  eth,
  sqk,
}: {
  children: ReactNode;
  eth?: bigint;
  sqk?: bigint;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const connections = useConnections();
  const { disconnectAsync, isPending: disconnecting } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSepoliaSwitch();
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected") &&
    !("ethereum" in window);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && !(mobile && c.type === "injected"),
  );
  useEffect(() => {
    setError("");
    setOpen(false);
  }, [address]);
  function label(c: Connector) {
    return c.id === "injected"
      ? "Browser wallet"
      : c.id === "coinbaseWalletSDK"
        ? mobile
          ? "Coinbase Smart Wallet"
          : "Coinbase Wallet"
        : c.name;
  }
  async function connect(c: Connector) {
    setError("");
    try {
      await connectAsync({ connector: c });
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <WalletContext.Provider
      value={() => {
        setError("");
        setOpen(true);
      }}
    >
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isConnected ? "Your wallet" : "Connect a wallet"}
      >
        {isConnected && address ? (
          <>
            <p className="muted">
              Connected on{" "}
              {chainId === sepolia.id ? "Ethereum Sepolia" : `chain ${chainId}`}
              . All app assets are testnet.
            </p>
            <div className="account-address">
              <code>{address}</code>
              <button
                className="icon-button"
                aria-label="Copy wallet address"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(address);
                    setCopied(true);
                  } catch {
                    setError(
                      "Clipboard unavailable. Select and copy the full address above.",
                    );
                  }
                }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Sepolia ETH</dt>
                <dd>{amount(eth, 18, 6)}</dd>
              </div>
              <div>
                <dt>SQK · testnet</dt>
                <dd>{amount(sqk)}</dd>
              </div>
            </dl>
            {chainId !== sepolia.id && (
              <button
                className="button primary full"
                disabled={switching}
                onClick={async () => {
                  try {
                    await switchChainAsync({ chainId: sepolia.id });
                    setError("");
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                {switching ? <LoaderCircle className="spin" size={18} /> : null}
                Switch to Sepolia
              </button>
            )}
            <div className="account-actions">
              <a
                href={`${EXPLORER}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="button secondary"
              >
                View on Etherscan <ExternalLink size={16} />
              </a>
              <button
                className="button secondary"
                disabled={disconnecting}
                onClick={async () => {
                  try {
                    for (const connection of connections)
                      await disconnectAsync({
                        connector: connection.connector,
                      });
                    setOpen(false);
                  } catch (e) {
                    setError(errorMessage(e));
                    setOpen(true);
                  }
                }}
              >
                <LogOut size={16} />
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Your Squeeks stay in your wallet. Connecting never asks for a
              signature.
            </p>
            <div className="wallet-options">
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    key={w.name}
                    className="wallet-row"
                    href={w.href(location.href)}
                  >
                    <img
                      src={w.icon ? `./assets/${w.icon}.svg` : coinbaseMark}
                      alt=""
                      width="28"
                      height="28"
                    />
                    <span>Open in {w.name}</span>
                    <ExternalLink size={16} />
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  type="button"
                  className="wallet-row"
                  key={c.uid}
                  onClick={() => void connect(c)}
                  disabled={isPending}
                >
                  {c.icon ? (
                    <img src={c.icon} alt="" width="28" height="28" />
                  ) : c.id === "coinbaseWalletSDK" ? (
                    <img src={coinbaseMark} alt="" width="28" height="28" />
                  ) : (
                    <Wallet size={28} />
                  )}
                  <span>{label(c)}</span>
                  {isPending && variables?.connector === c ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <ChevronDown size={16} className="wallet-chevron" />
                  )}
                </button>
              ))}
            </div>
            {!named && !mobile && (
              <p className="small muted">
                MetaMask, Rabby and OKX appear here when their browser
                extensions are available.
              </p>
            )}
            <p className="wallet-note">
              <span className="status-dot" />
              Ethereum Sepolia · testnet only
            </p>
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </Modal>
    </WalletContext.Provider>
  );
}
export function ConnectButton() {
  const open = useOpenWallet();
  const { address, chainId, isConnected, isConnecting, isReconnecting } =
    useAccount();
  const { switchChainAsync, isPending } = useSepoliaSwitch();
  const [error, setError] = useState("");
  async function switchNetwork() {
    try {
      await switchChainAsync({ chainId: sepolia.id });
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="connect-wrap">
      <button
        type="button"
        className={`button ${isConnected && chainId !== sepolia.id ? "warning-button" : "primary"} wallet-trigger`}
        disabled={isPending || isConnecting || isReconnecting}
        onClick={
          isConnected && chainId !== sepolia.id
            ? () => void switchNetwork()
            : open
        }
      >
        {isConnecting || isReconnecting || isPending ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Wallet size={16} />
        )}
        {isConnected && address
          ? chainId !== sepolia.id
            ? "Switch to Sepolia"
            : shortAddress(address)
          : "Connect wallet"}
        {isConnected && chainId === sepolia.id && <ChevronDown size={14} />}
      </button>
      {error && (
        <p className="connect-error" role="alert">
          {error}
          <button className="text-button" onClick={() => setError("")}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
