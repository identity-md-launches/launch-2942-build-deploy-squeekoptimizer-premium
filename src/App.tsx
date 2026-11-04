import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { getAddress } from "viem";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  Bolt,
  ExternalLink,
  Gem,
  GitMerge,
  Info,
  Layers3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { makeClient, sepolia } from "./chain/config";
import { verifyDeployment } from "./chain/verify";
import { readPortfolio, type ScanProgress } from "./chain/portfolio";
import { verifyReceiptEvents } from "./chain/actions";
import { errorMessage, exactAmount } from "./lib/format";
import { WalletProvider, ConnectButton } from "./components/Wallet";
import {
  TransactionFlow,
  type Activity,
  type Intent,
} from "./components/TransactionFlow";
import {
  ActivityPage,
  ClaimPage,
  CollectionState,
  Gallery,
  MergePage,
  Metrics,
  NetworkPage,
  PAGE_NAMES,
  PageHeading,
  QuickActions,
  Welcome,
  type Page,
} from "./components/Pages";
const nav: { page: Page; icon: typeof Layers3 }[] = [
  { page: "squeeks", icon: Layers3 },
  { page: "claim", icon: Gem },
  { page: "merge", icon: GitMerge },
  { page: "activity", icon: ActivityIcon },
];
function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function initialPage(): Page {
  const hash = location.hash.slice(1);
  return hash in PAGE_NAMES ? (hash as Page) : "squeeks";
}
export default function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const previousPage = useRef(page);
  const [rpc, setRpcState] = useState<string>(() => {
    const raw = readStored<unknown>("squeek:rpc", "");
    return typeof raw === "string" ? raw : "";
  });
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<bigint[]>([]);
  const [progress, setProgress] = useState<ScanProgress>();
  const [intent, setIntent] = useState<Intent>();
  const [message, setMessage] = useState("");
  const [activities, setActivities] = useState<Activity[]>(() => {
    const raw = readStored<unknown>("squeek:activity", []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (a) =>
          a &&
          typeof a.hash === "string" &&
          /^0x[0-9a-fA-F]{64}$/.test(a.hash) &&
          ["claim", "merge"].includes(a.kind) &&
          typeof a.owner === "string" &&
          /^0x[0-9a-fA-F]{40}$/.test(a.owner) &&
          Array.isArray(a.ids) &&
          a.ids.every(
            (id: unknown) => typeof id === "string" && /^\d+$/.test(id),
          ),
      )
      .slice(0, 50) as Activity[];
  });
  const { address, isConnected, chainId } = useAccount();
  const wrongChain = isConnected && chainId !== sepolia.id;
  const client = useMemo(() => makeClient(rpc || undefined), [rpc]);
  const verification = useQuery({
    queryKey: ["verification", rpc, generation],
    queryFn: () => verifyDeployment(client),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const portfolioQuery = useQuery({
    queryKey: [
      "portfolio",
      address,
      rpc,
      generation,
      verification.data?.blockHash,
    ],
    queryFn: ({ signal }) => {
      if (!address || !verification.data)
        throw new Error("Connect a wallet after deployment verification.");
      return readPortfolio(
        client,
        address,
        verification.data,
        setProgress,
        signal,
      );
    },
    enabled: !!address && !wrongChain && !!verification.data,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const portfolio = address && !wrongChain ? portfolioQuery.data : undefined;
  const loading = verification.isFetching || portfolioQuery.isFetching;
  const readError = verification.error || portfolioQuery.error;
  const canAct = !!portfolio && !wrongChain && !readError && !loading;
  useEffect(() => {
    const listener = () => setPage(initialPage());
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    document.title =
      page === "squeeks"
        ? "SqueekOptimizer · Your Squeeks, working smarter"
        : `${PAGE_NAMES[page]} · SqueekOptimizer`;
    if (previousPage.current !== page) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
      previousPage.current = page;
    }
  }, [page]);
  useEffect(() => {
    setSelected([]);
    setProgress(undefined);
  }, [address, chainId, rpc, generation]);
  function go(p: Page) {
    setPage(p);
    location.hash = p;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function refresh() {
    setGeneration((n) => n + 1);
    setMessage("");
  }
  function setRpc(value: string) {
    setRpcState(value);
    setSelected([]);
    setProgress(undefined);
    try {
      localStorage.setItem("squeek:rpc", JSON.stringify(value));
    } catch {
      setMessage("RPC changed for this visit. Browser storage is unavailable.");
    }
  }
  function addActivity(a: Activity) {
    setActivities((old) => {
      const next = [a, ...old.filter((x) => x.hash !== a.hash)].slice(0, 50);
      try {
        localStorage.setItem("squeek:activity", JSON.stringify(next));
      } catch {
        /* still available for this visit */
      }
      return next;
    });
  }
  async function checkActivity(a: Activity) {
    setMessage("Reading the Sepolia receipt…");
    try {
      const receipt = await client.getTransactionReceipt({ hash: a.hash });
      const head = await client.getBlockNumber();
      if (head < receipt.blockNumber + 1n) {
        setMessage(
          "Transaction is included and waiting for its second confirmation. Check again shortly.",
        );
        return;
      }
      if (receipt.status === "reverted") {
        addActivity({ ...a, status: "reverted" });
        setMessage("Transaction reverted. Gas may have been spent.");
        return;
      }
      const result = verifyReceiptEvents(receipt, {
        kind: a.kind,
        owner: getAddress(a.owner),
        ids: a.ids.map(BigInt),
      });
      addActivity({
        ...a,
        status: result.verified ? "confirmed" : "unverified",
        actualReward:
          result.actualReward === undefined
            ? undefined
            : exactAmount(result.actualReward),
      });
      setGeneration((n) => n + 1);
      setMessage(
        result.verified
          ? "Receipt and contract events verified with two confirmations."
          : "Receipt found, but expected contract events were not verified. Inspect the transaction on Etherscan.",
      );
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  const collectionState = (
    <CollectionState
      connected={isConnected}
      wrongChain={wrongChain}
      loading={loading}
      error={readError ? errorMessage(readError) : undefined}
      progress={progress}
      retry={refresh}
    />
  );
  return (
    <WalletProvider eth={portfolio?.eth} sqk={portfolio?.sqk}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#squeeks"
            aria-label="SqueekOptimizer home"
          >
            <img src="./favicon.svg" width="38" height="38" alt="" />
            <span>
              Squeek<span className="brand-sub">Optimizer</span>
            </span>
          </a>
          <div className="sidebar-nav-wrap">
            <span className="sidebar-section-label">
              Your little powerhouse
            </span>
            <nav aria-label="Main navigation">
              {nav.map((n) => (
                <a
                  key={n.page}
                  href={`#${n.page}`}
                  className={`nav-item ${page === n.page ? "active" : ""}`}
                  aria-current={page === n.page ? "page" : undefined}
                >
                  <n.icon size={19} />
                  <span>{PAGE_NAMES[n.page]}</span>
                  {page === n.page && <span className="nav-dot" />}
                </a>
              ))}
            </nav>
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <div className="tip-top">
                <ShieldCheck size={18} />
                <strong>Always in your paws.</strong>
              </div>
              <p>
                Your NFTs, your keys.
                <br />
                Every action needs your say.
              </p>
            </div>
            <a
              href="#network"
              className={`nav-item network-nav ${page === "network" ? "active" : ""}`}
              aria-current={page === "network" ? "page" : undefined}
            >
              <Bolt size={18} />
              <span>Network & contracts</span>
            </a>
            <a
              href="https://docs.squeekchain.com/developers/owner-actions/"
              className="nav-item"
              target="_blank"
              rel="noreferrer"
            >
              <Info size={18} />
              <span>How it works</span>
              <ExternalLink size={14} />
            </a>
            <div className="sidebar-attribution">
              <a href="https://imd.fun" target="_blank" rel="noreferrer">
                Built through IMD Swarm <ArrowUpRight size={13} />
              </a>
              <span>Independent Genesis Code utility</span>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <a
              href="#squeeks"
              className="mobile-brand"
              aria-label="SqueekOptimizer home"
            >
              <img src="./favicon.svg" alt="" width="30" height="30" />
              <span>
                Squeek<span>Optimizer</span>
              </span>
            </a>
            <div className="breadcrumb">
              <span>SqueekOptimizer</span>
              <span>/</span>
              <span>{PAGE_NAMES[page]}</span>
            </div>
            <div className="topbar-actions">
              <a className="network-chip" href="#network">
                <span className="status-dot" />
                Sepolia <span className="testnet-word">testnet</span>
              </a>
              <ConnectButton />
            </div>
          </header>
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {nav.map((n) => (
              <a
                key={n.page}
                href={`#${n.page}`}
                className={page === n.page ? "active" : ""}
                aria-current={page === n.page ? "page" : undefined}
              >
                <n.icon size={17} />
                <span>
                  {n.page === "squeeks"
                    ? "My Squeeks"
                    : n.page === "claim"
                      ? "Claim"
                      : n.page === "merge"
                        ? "Merge"
                        : "Activity"}
                </span>
              </a>
            ))}
          </nav>
          <main id="main-content" tabIndex={-1}>
            {wrongChain && (
              <div className="notice warning">
                <Info size={18} />
                <p>
                  Your wallet is on chain {chainId}. Switch to Ethereum Sepolia
                  before claiming or merging.
                </p>
              </div>
            )}
            {readError && page !== "network" && (
              <div className="read-error notice error" role="alert">
                <Info size={18} />
                <div>
                  <strong>Sepolia reads are unavailable</strong>
                  <p>{errorMessage(readError)}</p>
                  <a href="#network">
                    Review network & contracts
                    <ArrowRightIcon />
                  </a>
                </div>
              </div>
            )}
            {message && (
              <div className="notice" role="status">
                <p>{message}</p>
                <button className="text-button" onClick={() => setMessage("")}>
                  Dismiss
                </button>
              </div>
            )}
            {page === "squeeks" && (
              <>
                <PageHeading
                  title="My Squeeks"
                  description="Manage your NFTs and their mining rewards."
                >
                  <button
                    className="button secondary refresh-button"
                    onClick={refresh}
                    disabled={loading}
                  >
                    {loading ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    Refresh
                  </button>
                </PageHeading>
                <Welcome connected={isConnected && !wrongChain} onGo={go} />
                <Metrics portfolio={portfolio} />
                <Gallery
                  portfolio={portfolio}
                  client={client}
                  selected={selected}
                  setSelected={setSelected}
                  onClaim={() => {
                    if (canAct) setIntent({ kind: "claim", ids: selected });
                  }}
                  state={collectionState}
                />
                <QuickActions onGo={go} />
              </>
            )}
            {page === "claim" && (
              <ClaimPage
                portfolio={portfolio}
                client={client}
                selected={selected}
                setSelected={setSelected}
                onPrepare={(i) => {
                  if (canAct) setIntent(i);
                }}
                state={collectionState}
                canAct={canAct}
              />
            )}
            {page === "merge" && (
              <MergePage
                portfolio={portfolio}
                onPrepare={(i) => {
                  if (canAct) setIntent(i);
                }}
                state={collectionState}
                canAct={canAct}
              />
            )}
            {page === "activity" && (
              <ActivityPage
                activities={
                  address
                    ? activities.filter(
                        (a) => a.owner.toLowerCase() === address.toLowerCase(),
                      )
                    : []
                }
                onCheck={(a) => void checkActivity(a)}
              />
            )}
            {page === "network" && (
              <NetworkPage
                verification={verification.data}
                error={
                  verification.error
                    ? errorMessage(verification.error)
                    : undefined
                }
                loading={verification.isFetching}
                rpc={rpc}
                setRpc={setRpc}
                refresh={refresh}
              />
            )}
            <footer className="footer">
              <span>
                <ShieldCheck size={14} />
                Non-custodial. Always.
              </span>
              <a href="#network" className="verification-status">
                {verification.isFetching ? (
                  <>
                    <LoaderCircle className="spin" size={13} />
                    Checking deployment
                  </>
                ) : verification.data ? (
                  <>
                    <span className="status-dot" />
                    Contracts verified at #
                    {verification.data.blockNumber.toString()}
                  </>
                ) : (
                  <>
                    <Info size={14} />
                    Contract reads unavailable
                  </>
                )}
              </a>
              <a
                href="https://squeekchain.com/genesis/code"
                target="_blank"
                rel="noreferrer"
              >
                Squeekchain Genesis <ArrowUpRight size={14} />
              </a>
            </footer>
            <p className="mobile-attribution">
              <a href="https://imd.fun" target="_blank" rel="noreferrer">
                Built through IMD Swarm
              </a>{" "}
              · Testnet utility · No Genesis approval claimed
            </p>
          </main>
        </div>
      </div>
      {intent && (
        <TransactionFlow
          intent={intent}
          client={client}
          onClose={() => setIntent(undefined)}
          onRefresh={refresh}
          onActivity={addActivity}
        />
      )}
    </WalletProvider>
  );
}
function ArrowRightIcon() {
  return <span aria-hidden="true"> →</span>;
}
