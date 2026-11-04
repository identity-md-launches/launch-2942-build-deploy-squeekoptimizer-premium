import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Bolt,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Gem,
  GitMerge,
  Info,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { Portfolio, ScanProgress, Squeek } from "../chain/portfolio";
import type { Verification } from "../chain/verify";
import {
  ADDRESSES,
  EXPLORER,
  PUBLIC_RPC,
  type ReadClient,
} from "../chain/config";
import { eligibility, mergeProblems } from "../chain/actions";
import { NftCard } from "./NftCard";
import { useOpenWallet } from "./Wallet";
import { amount } from "../lib/format";
import type { Activity, Intent } from "./TransactionFlow";
export type Page = "squeeks" | "claim" | "merge" | "activity" | "network";
export const PAGE_NAMES: Record<Page, string> = {
  squeeks: "My Squeeks",
  claim: "Smart claim",
  merge: "Merge optimizer",
  activity: "Activity",
  network: "Network & contracts",
};
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="page-title-line">
          <h1>{title}</h1>
          <span className="testnet-badge">Testnet</span>
        </div>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Welcome({
  connected,
  onGo,
}: {
  connected: boolean;
  onGo: (page: Page) => void;
}) {
  const openWallet = useOpenWallet();
  return (
    <section className="welcome-panel">
      <div className="welcome-copy">
        <span className="welcome-label">
          <span className="tiny-spark" />A home for your hamster crew
        </span>
        <h2>
          Small Squeeks. <span>Big potential.</span>
        </h2>
        <p>A non-custodial home for your Squeeks.</p>
        <button
          className="button warm"
          onClick={connected ? () => onGo("claim") : openWallet}
        >
          {connected ? "Claim my rewards" : "Find my Squeeks"}
          <ArrowRight size={17} />
        </button>
      </div>
      <img className="welcome-mascot" src="./assets/squeek-mascot.svg" alt="" />
      <span className="welcome-footnote">Powered by tiny paws.</span>
    </section>
  );
}
export function Metrics({ portfolio }: { portfolio?: Portfolio }) {
  const ready = portfolio?.nfts.filter(
    (n) =>
      !eligibility(
        n,
        portfolio.snapshot.policy,
        portfolio.snapshot.state.blockHeight,
      ),
  );
  const metrics = [
    {
      label: "Squeeks owned",
      icon: <Layers3 size={17} />,
      value: portfolio ? portfolio.nfts.length.toLocaleString() : "—",
      suffix: "NFTs",
      color: "orange",
    },
    {
      label: "Claimable rewards",
      icon: <Gem size={17} />,
      value: amount(portfolio?.claimable),
      suffix: "SQK · testnet",
      color: "purple",
    },
    {
      label: "Active power",
      icon: <Bolt size={17} />,
      value: portfolio
        ? portfolio.nfts
            .reduce((s, n) => s + n.position.activeWeight, 0n)
            .toLocaleString()
        : "—",
      suffix: "power",
      color: "orange",
    },
    {
      label: "Merge-ready Squeeks",
      icon: <GitMerge size={17} />,
      value: ready?.length.toString() ?? "—",
      suffix: "eligible NFTs",
      color: "green",
    },
  ];
  return (
    <section className="metrics" aria-label="Wallet summary">
      {metrics.map((m) => (
        <div key={m.label} className="metric">
          <div className="metric-label">
            <span className={m.color}>{m.icon}</span>
            {m.label}
          </div>
          <div className="metric-value">
            {m.value}
            <span>{m.suffix}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
export function CollectionState({
  connected,
  wrongChain,
  loading,
  error,
  progress,
  retry,
}: {
  connected: boolean;
  wrongChain: boolean;
  loading: boolean;
  error?: string;
  progress?: ScanProgress;
  retry: () => void;
}) {
  const openWallet = useOpenWallet();
  if (loading && connected && !wrongChain)
    return (
      <div className="collection-state" role="status">
        <LoaderCircle size={32} className="spin" />
        <h3>Finding your Squeeks</h3>
        <p>Reading verified ownership and mining positions.</p>
        {progress && (
          <p className="small muted">
            {progress.source === "indexer"
              ? `Indexed transfer pages: ${progress.scanned}`
              : `Transfer history: ${progress.scanned.toLocaleString()} / ${progress.total.toLocaleString()} blocks`}
          </p>
        )}
      </div>
    );
  if (error && connected && !wrongChain)
    return (
      <div className="collection-state">
        <Info size={32} />
        <h3>We couldn’t load your collection</h3>
        <p className="error-text" role="alert">
          {error}
        </p>
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  if (wrongChain)
    return (
      <div className="collection-state">
        <ArrowRightLeft size={32} />
        <h3>Your Squeeks are on Sepolia</h3>
        <p>Switch your wallet to Ethereum Sepolia to manage testnet NFTs.</p>
        <button className="button secondary" onClick={openWallet}>
          Choose network
        </button>
      </div>
    );
  if (!connected)
    return (
      <div className="collection-state disconnected">
        <div className="empty-wallet">
          <Wallet size={32} />
          <span className="mini-spark">+</span>
        </div>
        <h3>Your crew belongs here</h3>
        <p>Connect your wallet to reveal your Squeeks.</p>
        <div className="empty-trust">
          <ShieldCheck size={14} />
          Your NFTs never leave your wallet.
        </div>
      </div>
    );
  return (
    <div className="collection-state">
      <Layers3 size={32} />
      <h3>No Squeeks in this wallet</h3>
      <p>
        Verified NFT balance: 0. Try another wallet that owns Squeeks on
        Sepolia.
      </p>
      <button className="button secondary" onClick={openWallet}>
        View connected wallet
      </button>
      <a
        className="text-link"
        href="https://squeekchain.com/genesis/code"
        target="_blank"
        rel="noreferrer"
      >
        Explore Squeekchain <ArrowUpRight size={14} />
      </a>
    </div>
  );
}
export function Gallery({
  portfolio,
  client,
  selected,
  setSelected,
  onClaim,
  state,
}: {
  portfolio?: Portfolio;
  client: ReadClient;
  selected: bigint[];
  setSelected: (ids: bigint[]) => void;
  onClaim: () => void;
  state: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const items = useMemo(
    () =>
      (portfolio?.nfts ?? [])
        .filter(
          (n) =>
            n.id.toString().includes(search.trim().replace(/^#/, "")) &&
            (filter === "all" ||
              (filter === "ready"
                ? !eligibility(
                    n,
                    portfolio!.snapshot.policy,
                    portfolio!.snapshot.state.blockHeight,
                  )
                : n.position.pendingRound !== 0)),
        )
        .sort((a, b) =>
          sort === "power"
            ? a.position.activeWeight > b.position.activeWeight
              ? -1
              : a.position.activeWeight < b.position.activeWeight
                ? 1
                : a.id < b.id
                  ? -1
                  : 1
            : a.id < b.id
              ? -1
              : 1,
        ),
    [portfolio, search, filter, sort],
  );
  const toggle = (id: bigint) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : selected.length < 32
          ? [...selected, id]
          : selected,
    );
  return (
    <section className="collection-section">
      <div className="section-heading">
        <h2>
          Your collection{" "}
          <span className="count-label">
            {portfolio ? portfolio.nfts.length : "—"}
          </span>
        </h2>
        {!!portfolio?.nfts.length && (
          <button
            className="text-button"
            onClick={() =>
              setSelected(
                selected.length ? [] : items.slice(0, 32).map((n) => n.id),
              )
            }
          >
            {selected.length ? "Clear selection" : "Select up to 32"}
          </button>
        )}
      </div>
      <div className="collection-toolbar">
        <div className="filter-buttons" aria-label="Filter Squeeks">
          {[
            ["all", "All Squeeks"],
            ["ready", "Merge ready"],
            ["pending", "Pending"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={filter === value ? "active" : ""}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search-sort">
          <label className="search-field">
            <Search size={16} />
            <span className="sr-only">Search token ID</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID"
              inputMode="numeric"
            />
          </label>
          <label className="sort-field">
            <span className="sr-only">Sort collection</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="id">Token ID</option>
              <option value="power">Power</option>
            </select>
          </label>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            <Check size={16} />
            {selected.length} of 32 selected
          </span>
          <button className="button primary" onClick={onClaim}>
            Review claim
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      {!portfolio?.nfts.length ? (
        state
      ) : items.length ? (
        <div className="nft-grid">
          {items.map((n) => (
            <NftCard
              key={n.id.toString()}
              nft={n}
              snapshot={portfolio.snapshot}
              client={client}
              selected={selected.includes(n.id)}
              onSelect={() => toggle(n.id)}
              disabled={selected.length >= 32}
            />
          ))}
        </div>
      ) : (
        <div className="no-matches">
          <Search size={28} />
          <h3>No matching Squeeks</h3>
          <p className="muted">Try another token ID or filter.</p>
          <button
            className="button secondary"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}
export function QuickActions({ onGo }: { onGo: (page: Page) => void }) {
  return (
    <div className="quick-actions">
      <button onClick={() => onGo("claim")} className="quick-action">
        <span className="quick-icon purple">
          <Gem size={23} />
        </span>
        <span>
          <strong>A smarter way to claim</strong>
          <span>Batch rewards from up to 32 Squeeks.</span>
        </span>
        <ArrowUpRight size={19} />
      </button>
      <button onClick={() => onGo("merge")} className="quick-action">
        <span className="quick-icon orange">
          <GitMerge size={23} />
        </span>
        <span>
          <strong>Find your next level</strong>
          <span>Check pairs before you merge.</span>
        </span>
        <ArrowUpRight size={19} />
      </button>
    </div>
  );
}
export function ClaimPage({
  portfolio,
  client,
  selected,
  setSelected,
  onPrepare,
  state,
  canAct,
}: {
  portfolio?: Portfolio;
  client: ReadClient;
  selected: bigint[];
  setSelected: (ids: bigint[]) => void;
  onPrepare: (intent: Intent) => void;
  state: ReactNode;
  canAct: boolean;
}) {
  return (
    <>
      <PageHeading
        title="Smart claim"
        description="Collect real SQK rewards in one carefully checked batch."
      />
      <div className="flow-note">
        <ShieldCheck size={20} />
        <p>
          Choose 1–32 Squeeks. We verify ownership, sort IDs and simulate the
          exact payout before your wallet opens.
        </p>
      </div>
      <Gallery
        portfolio={portfolio}
        client={client}
        selected={selected}
        setSelected={setSelected}
        onClaim={() => onPrepare({ kind: "claim", ids: selected })}
        state={state}
      />
      <section className="claim-summary">
        <div>
          <span className="muted">Selected for this batch</span>
          <h2>{selected.length} / 32 Squeeks</h2>
          <p className="small muted">
            The review shows the exact combined claimable SQK, including shared
            fractions.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!canAct || selected.length === 0}
          onClick={() => onPrepare({ kind: "claim", ids: selected })}
        >
          Simulate & review claim
          <ArrowRight size={17} />
        </button>
      </section>
      <div className="help-line">
        <Info size={16} />
        <p>
          Rewards become claimable after the network checkpoints settled work.
          Claims need no token approval. All SQK is testnet.
        </p>
      </div>
    </>
  );
}
export function MergePage({
  portfolio,
  onPrepare,
  canAct,
  state,
}: {
  portfolio?: Portfolio;
  onPrepare: (intent: Intent) => void;
  canAct: boolean;
  state: ReactNode;
}) {
  const [survivor, setSurvivor] = useState("");
  const [donor, setDonor] = useState("");
  const a = portfolio?.nfts.find((n) => n.id.toString() === survivor);
  const b = portfolio?.nfts.find((n) => n.id.toString() === donor);
  const problems =
    a && b && portfolio
      ? mergeProblems(
          a,
          b,
          portfolio.snapshot.policy,
          portfolio.snapshot.state.blockHeight,
        )
      : [];
  const ready =
    portfolio?.nfts.filter(
      (n) =>
        !eligibility(
          n,
          portfolio.snapshot.policy,
          portfolio.snapshot.state.blockHeight,
        ),
    ) ?? [];
  const groups = ready.reduce<Record<number, Squeek[]>>((g, n) => {
    (g[n.position.level] ??= []).push(n);
    return g;
  }, {});
  const candidates = Object.entries(groups).filter(
    ([, group]) => group.length >= 2,
  );
  const nextPower =
    a && portfolio
      ? portfolio.snapshot.policy.levels[a.position.level]?.weight
      : undefined;
  return (
    <>
      <PageHeading
        title="Merge optimizer"
        description="Two Squeeks. One next-level survivor. Always your decision."
      />
      <div className="merge-layout">
        <section className="merge-builder">
          <div className="section-heading">
            <h2>Build your pair</h2>
            <span className="subtle-badge">
              <ShieldCheck size={14} />
              Owner only
            </span>
          </div>
          <p className="muted">
            The survivor keeps its ID and image. The donor is burned
            permanently.
          </p>
          {!portfolio?.nfts.length ? (
            state
          ) : (
            <>
              <div className="merge-pickers">
                <MergePicker
                  label="Survivor"
                  description="The Squeek you keep"
                  value={survivor}
                  onChange={setSurvivor}
                  nfts={portfolio.nfts}
                  nft={a}
                />
                <div className="merge-plus" aria-hidden="true">
                  +
                </div>
                <MergePicker
                  label="Donor"
                  description="Permanently burned"
                  value={donor}
                  onChange={setDonor}
                  nfts={portfolio.nfts}
                  nft={b}
                />
              </div>
              <button
                className="text-button swap-button"
                disabled={!survivor && !donor}
                onClick={() => {
                  setSurvivor(donor);
                  setDonor(survivor);
                }}
              >
                <ArrowRightLeft size={15} />
                Swap survivor & donor
              </button>
              {a && b && (
                <div className="merge-projection">
                  <span className="projection-icon">
                    <GitMerge size={22} />
                  </span>
                  <div>
                    <span className="muted">
                      Squeek #{a.id.toString()} after merge
                    </span>
                    <h3>
                      Level {a.position.level} <ArrowRight size={16} /> Level{" "}
                      {a.position.level + 1}
                    </h3>
                    <p>
                      {(
                        a.position.activeWeight + b.position.activeWeight
                      ).toLocaleString()}{" "}
                      active power <ArrowRight size={13} />{" "}
                      {nextPower?.toLocaleString() ?? "Unavailable"} after
                      activation
                    </p>
                  </div>
                </div>
              )}
              {!!problems.length && (
                <div className="notice warning" role="status">
                  <ul>
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                className="button primary full"
                disabled={!canAct || !a || !b || problems.length > 0}
                onClick={() => {
                  if (a && b) onPrepare({ kind: "merge", ids: [a.id, b.id] });
                }}
              >
                Simulate & review merge
                <ArrowRight size={17} />
              </button>
              <p className="small muted">
                Review the permanent burn warning and estimated gas before
                explicitly confirming in your wallet.
              </p>
            </>
          )}
        </section>
        <aside className="merge-rules">
          <span className="rule-icon">
            <CircleHelp size={24} />
          </span>
          <h2>A good pair checks every box</h2>
          <ul className="check-list">
            <li>
              <Check size={16} />
              Both NFTs belong to you
            </li>
            <li>
              <Check size={16} />
              Same level, below the maximum
            </li>
            <li>
              <Check size={16} />
              No pending power activation
            </li>
            <li>
              <Check size={16} />
              Both merge cooldowns complete
            </li>
          </ul>
          <div className="rule-foot">
            <Info size={16} />
            <p>
              Cooldowns count completed Squeek blocks, not minutes.{" "}
              {portfolio
                ? `Current height: ${portfolio.snapshot.state.blockHeight.toLocaleString()}.`
                : "Connect to check eligibility."}
            </p>
          </div>
          <a
            className="text-link"
            href="https://docs.squeekchain.com/squeeks/merge/"
            target="_blank"
            rel="noreferrer"
          >
            Read the merge guide <ExternalLink size={14} />
          </a>
        </aside>
      </div>
      <section className="candidate-section">
        <div className="section-heading">
          <h2>Eligible same-level groups</h2>
          <span className="muted small">Each group can form a pair</span>
        </div>
        {candidates.length ? (
          <div className="candidate-grid">
            {candidates.map(([level, group]) => (
              <div className="candidate-row" key={level}>
                <span className="candidate-level">{level}</span>
                <div>
                  <h3>
                    {group.length} Squeeks at level {level}
                  </h3>
                  <p className="muted">
                    {group.map((n) => `#${n.id}`).join(", ")}
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSurvivor(group[0].id.toString());
                    setDonor(group[1].id.toString());
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                >
                  Choose pair
                  <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="candidate-empty">
            <GitMerge size={24} />
            <p className="muted">
              {portfolio
                ? "No eligible same-level pairs in this snapshot. Check pending activations and cooldowns, then refresh."
                : "Your eligible pairs will appear after connecting your wallet."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
function MergePicker({
  label,
  description,
  value,
  onChange,
  nfts,
  nft,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (s: string) => void;
  nfts: Squeek[];
  nft?: Squeek;
}) {
  return (
    <div className={`merge-picker ${label === "Donor" ? "donor" : ""}`}>
      <label htmlFor={`pick-${label}`}>
        <strong>{label}</strong>
        <span>{description}</span>
      </label>
      <div className="picker-illustration">
        {nft ? (
          <>
            <Layers3 size={32} />
            <strong>#{nft.id.toString()}</strong>
            <span>Level {nft.position.level}</span>
          </>
        ) : (
          <Layers3 size={40} />
        )}
      </div>
      <select
        id={`pick-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a Squeek</option>
        {nfts.map((n) => (
          <option key={n.id.toString()} value={n.id.toString()}>
            #{n.id.toString()} · Level {n.position.level}
          </option>
        ))}
      </select>
    </div>
  );
}
export function ActivityPage({
  activities,
  onCheck,
}: {
  activities: Activity[];
  onCheck: (a: Activity) => void;
}) {
  return (
    <>
      <PageHeading
        title="Your activity"
        description="Transactions submitted here, stored only in this browser."
      />
      {activities.length ? (
        <div className="activity-list">
          {activities.map((a) => (
            <article className="activity-row" key={a.hash}>
              <span
                className={`activity-icon ${a.kind === "claim" ? "purple" : "orange"}`}
              >
                {a.kind === "claim" ? (
                  <Gem size={23} />
                ) : (
                  <GitMerge size={23} />
                )}
              </span>
              <div>
                <h2>
                  {a.kind === "claim" ? "SQK claim" : "NFT merge"}{" "}
                  <span className="subtle-badge">{a.status}</span>
                </h2>
                <p>
                  {a.ids.map((id) => `#${id}`).join(", ")}
                  {a.actualReward
                    ? ` · ${a.actualReward} SQK received (testnet)`
                    : ""}
                </p>
                <a
                  href={`${EXPLORER}/tx/${a.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="activity-hash"
                >
                  <code>{a.hash}</code>
                  <ExternalLink size={14} />
                </a>
              </div>
              {a.status === "pending" && (
                <button className="button secondary" onClick={() => onCheck(a)}>
                  Check receipt
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="panel activity-empty">
          <div className="empty-wallet">
            <ArrowDown size={30} />
          </div>
          <h2>A fresh start</h2>
          <p className="muted">
            Your claims and merges will appear here after submission.
          </p>
          <p className="small muted">
            Connecting a wallet does not send a transaction.
          </p>
        </div>
      )}
    </>
  );
}
export function NetworkPage({
  verification,
  error,
  loading,
  rpc,
  setRpc,
  refresh,
}: {
  verification?: Verification;
  error?: string;
  loading: boolean;
  rpc: string;
  setRpc: (rpc: string) => void;
  refresh: () => void;
}) {
  const [value, setValue] = useState(rpc);
  const [validation, setValidation] = useState("");
  return (
    <>
      <PageHeading
        title="Network & contracts"
        description="Check exactly where your wallet’s transactions go."
      >
        <button
          className="button secondary"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          Recheck
        </button>
      </PageHeading>
      <section className="network-status panel">
        <ShieldCheck size={28} />
        <div>
          <h2>
            {loading
              ? "Checking the official deployment"
              : error
                ? "Deployment verification unavailable"
                : verification
                  ? "Official deployment matches"
                  : "Deployment not checked"}
          </h2>
          <p className="muted">
            Ethereum Sepolia · chain ID 11155111 · all assets are testnet
          </p>
        </div>
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {verification && (
        <p className="snapshot-line">
          Verified at Ethereum block {verification.blockNumber.toString()}. Core
          v3 · Mining v6.{" "}
          <a
            href={`${EXPLORER}/block/${verification.blockNumber}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect block <ExternalLink size={13} />
          </a>
        </p>
      )}
      <section className="contract-list panel">
        <h2>Official contracts</h2>
        {Object.entries(ADDRESSES).map(([name, address]) => (
          <div className="contract-row" key={name}>
            <div>
              <h3>
                {name === "token"
                  ? "SQK token"
                  : name === "nft"
                    ? "Squeek NFT"
                    : name === "core"
                      ? "SqueekCore"
                      : "SqueekMining"}
              </h3>
              <span className="small muted">
                {name === "core" || name === "mining"
                  ? "EIP-1967 proxy"
                  : "Immutable"}
              </span>
            </div>
            <a
              href={`${EXPLORER}/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              <code>{address}</code>
              <ExternalLink size={15} />
            </a>
          </div>
        ))}
        <p className="small muted">
          Verification checks proxy storage, runtime hashes, versions, layout
          digests, governance, launch configuration and contract links. A
          mismatch disables writes.
        </p>
      </section>
      <section className="panel rpc-panel">
        <h2>Your read-only RPC</h2>
        <p className="muted">
          Public RPCs can be busy. You can use another Sepolia endpoint. This
          setting stays in your browser.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value) {
              try {
                const u = new URL(value);
                if (u.protocol !== "https:" || u.username || u.password)
                  throw new Error();
              } catch {
                setValidation(
                  "Enter an HTTPS RPC URL without embedded credentials.",
                );
                return;
              }
            }
            setValidation("");
            setRpc(value.trim());
          }}
        >
          <label htmlFor="rpc">
            Sepolia RPC URL <span className="small muted">(optional)</span>
          </label>
          <div className="rpc-form-row">
            <input
              id="rpc"
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={PUBLIC_RPC}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="button primary" type="submit">
              Save & verify
            </button>
          </div>
          {validation && (
            <p className="error-text" role="alert">
              {validation}
            </p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setValue("");
              setValidation("");
              setRpc("");
            }}
          >
            Use public RPCs
          </button>
        </form>
      </section>
      <div className="help-line">
        <Info size={17} />
        <p>
          The official Sepolia contracts are upgradeable and experimental. This
          app is built through IMD Swarm and does not claim Genesis approval.{" "}
          <a
            href="https://docs.squeekchain.com/developers/"
            target="_blank"
            rel="noreferrer"
          >
            Official developer reference <ExternalLink size={13} />
          </a>
        </p>
      </div>
    </>
  );
}
