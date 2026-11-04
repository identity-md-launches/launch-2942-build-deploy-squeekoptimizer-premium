import { useEffect, useRef, useState } from "react";
import { getAccount, getWalletClient } from "@wagmi/core";
import { useAccount } from "wagmi";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Fuel,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { type Hash, type TransactionReceipt } from "viem";
import { Modal } from "./Modal";
import {
  ADDRESSES,
  EXPLORER,
  config,
  sepolia,
  type ReadClient,
} from "../chain/config";
import {
  prepareAction,
  revalidatePreview,
  verifyReceiptEvents,
  type ActionPreview,
} from "../chain/actions";
import { sameAddress } from "../chain/verify";
import { exactAmount, errorMessage } from "../lib/format";
export type Intent = { kind: "claim" | "merge"; ids: bigint[] };
export type Activity = {
  hash: Hash;
  kind: "claim" | "merge";
  ids: string[];
  owner: string;
  status:
    | "pending"
    | "confirmed"
    | "reverted"
    | "cancelled"
    | "replaced"
    | "unverified";
  actualReward?: string;
};
export function TransactionFlow({
  intent,
  client,
  onClose,
  onRefresh,
  onActivity,
}: {
  intent: Intent;
  client: ReadClient;
  onClose: () => void;
  onRefresh: () => void;
  onActivity: (a: Activity) => void;
}) {
  const { address, chainId } = useAccount();
  const original = useRef({ address, chainId });
  const busy = useRef(false);
  const [preview, setPreview] = useState<ActionPreview>();
  const [phase, setPhase] = useState<
    | "preparing"
    | "review"
    | "checking"
    | "wallet"
    | "pending"
    | "success"
    | "error"
    | "tracking-error"
  >("preparing");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [ack, setAck] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt>();
  const [actual, setActual] = useState<bigint>();
  const [expired, setExpired] = useState(false);
  const replacementCancelled = useRef(false);
  const activeHash = useRef<Hash | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (!address || chainId !== sepolia.id) {
      setError("Connect the owning wallet on Ethereum Sepolia.");
      setPhase("error");
      return;
    }
    prepareAction(client, intent.kind, intent.ids, address)
      .then((p) => {
        if (active) {
          const current = getAccount(config);
          if (
            !current.address ||
            !sameAddress(current.address, p.owner) ||
            current.chainId !== sepolia.id
          )
            throw new Error(
              "Wallet changed during preparation. Close this preview and prepare again.",
            );
          setPreview(p);
          setPhase("review");
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setPhase("error");
        }
      });
    return () => {
      active = false;
    };
    // An intent is immutable. Account changes invalidate it in the separate guard below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, intent]);
  useEffect(() => {
    if (hash || phase === "pending" || phase === "success") return;
    if (
      address !== original.current.address ||
      chainId !== original.current.chainId
    ) {
      setPreview(undefined);
      setError(
        "Wallet account or network changed. Close this preview and prepare again.",
      );
      setPhase("error");
    }
  }, [address, chainId, hash, phase]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, preview.createdAt + 120_000 - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [preview]);
  const addActivity = (
    status: Activity["status"],
    txHash: Hash,
    reward?: bigint,
  ) => {
    if (!preview) return;
    onActivity({
      hash: txHash,
      owner: preview.owner,
      kind: preview.kind,
      ids: preview.ids.map(String),
      status,
      actualReward: reward === undefined ? undefined : exactAmount(reward),
    });
  };
  async function track(txHash: Hash, p: ActionPreview) {
    setPhase("pending");
    setError("");
    try {
      const r = await client.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 2,
        timeout: 180_000,
        onReplaced: ({ reason, transaction }) => {
          addActivity("replaced", txHash);
          activeHash.current = transaction.hash;
          setHash(transaction.hash);
          if (reason === "cancelled" || reason === "replaced")
            replacementCancelled.current = true;
        },
      });
      const resolvedHash = activeHash.current || txHash;
      if (replacementCancelled.current) {
        addActivity("cancelled", resolvedHash);
        throw new Error(
          "The original transaction was cancelled or replaced. Check Etherscan for the replacement; no optimizer action is marked successful.",
        );
      }
      if (r.status === "reverted") {
        addActivity("reverted", resolvedHash);
        throw new Error(
          "Transaction reverted on Sepolia. Gas may have been spent. Refresh your NFTs before preparing again.",
        );
      }
      const result = verifyReceiptEvents(r, p);
      if (!result.verified) {
        addActivity("unverified", resolvedHash);
        throw new Error(
          "The receipt succeeded but expected Squeek events could not be verified. Inspect it on Etherscan; no claim or merge is marked confirmed.",
        );
      }
      setReceipt(r);
      setActual(result.actualReward);
      setPhase("success");
      addActivity("confirmed", resolvedHash, result.actualReward);
      onRefresh();
    } catch (e) {
      setError(errorMessage(e));
      setPhase(
        /timeout|timed out|rpc|network|fetch|not found/i.test(
          e instanceof Error ? e.message : String(e),
        )
          ? "tracking-error"
          : "error",
      );
    }
  }
  async function confirm() {
    if (busy.current || !preview || (preview.kind === "merge" && !ack)) return;
    busy.current = true;
    setPhase("checking");
    setError("");
    try {
      await revalidatePreview(client, preview);
      const account = getAccount(config);
      if (
        !account.address ||
        !sameAddress(account.address, preview.owner) ||
        account.chainId !== sepolia.id
      )
        throw new Error(
          "Wallet changed. Close this preview and prepare again on Sepolia.",
        );
      const wallet = await getWalletClient(config, { chainId: sepolia.id });
      const [walletChain, walletAddresses] = await Promise.all([
        wallet.getChainId(),
        wallet.getAddresses(),
      ]);
      if (
        walletChain !== sepolia.id ||
        !walletAddresses.some((a) => sameAddress(a, preview.owner))
      )
        throw new Error(
          "The active wallet account or network differs from this preview.",
        );
      setPhase("wallet");
      const txHash = await wallet.sendTransaction({
        account: preview.owner,
        chain: sepolia,
        to: ADDRESSES.mining,
        data: preview.data,
        value: 0n,
        gas: preview.gas,
        maxFeePerGas: preview.maxFeePerGas,
        maxPriorityFeePerGas: preview.maxPriorityFeePerGas,
      });
      activeHash.current = txHash;
      setHash(txHash);
      addActivity("pending", txHash);
      await track(txHash, preview);
    } catch (e) {
      setError(errorMessage(e));
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }
  const locked =
    phase === "checking" || phase === "wallet" || phase === "pending";
  const heading =
    phase === "success"
      ? intent.kind === "claim"
        ? "SQK claim confirmed"
        : "Merge confirmed"
      : intent.kind === "claim"
        ? "Review your claim"
        : "Review your merge";
  return (
    <Modal open onClose={onClose} title={heading} wide locked={locked}>
      {(phase === "preparing" || phase === "checking") && (
        <div className="tx-loading" role="status">
          <LoaderCircle className="spin" size={28} />
          <h3>
            {phase === "preparing"
              ? "Preparing a safe preview"
              : "Checking the latest state"}
          </h3>
          <p className="muted">
            Verifying contracts, ownership, simulation and gas.
          </p>
        </div>
      )}
      {phase === "wallet" && (
        <div className="notice" role="status">
          <LoaderCircle className="spin" size={18} />
          Review and approve in your wallet. You can reject the request there.
        </div>
      )}
      {preview && phase !== "preparing" && phase !== "checking" && (
        <>
          <div
            className={`tx-result ${preview.kind === "merge" ? "merge-result" : ""}`}
          >
            {phase === "success" ? (
              <Check size={24} />
            ) : (
              <ShieldCheck size={24} />
            )}
            <span>
              {preview.kind === "claim"
                ? phase === "success"
                  ? "SQK received · testnet"
                  : "Simulated SQK payout · testnet"
                : `Survivor #${preview.ids[0]} · level ${preview.nextLevel}`}
            </span>
            <strong>
              {preview.kind === "claim"
                ? exactAmount(actual ?? preview.reward)
                : `${preview.nextPower?.toLocaleString()} power`}
            </strong>
            {preview.kind === "merge" && (
              <p>
                New power activates after the next round is checkpointed. Both
                NFTs’ unclaimed rewards stay with the survivor.
              </p>
            )}
          </div>
          <dl className="detail-list tx-details">
            <div>
              <dt>Network</dt>
              <dd>Ethereum Sepolia · 11155111</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd>
                <code>
                  {preview.kind === "claim"
                    ? "claim(0, ids)"
                    : "merge(0, survivor, donor)"}
                </code>
              </dd>
            </div>
            <div>
              <dt>
                {preview.kind === "claim" ? "Token IDs" : "Survivor / donor"}
              </dt>
              <dd>
                {preview.ids
                  .map((id) => `#${id}`)
                  .join(preview.kind === "claim" ? ", " : " / ")}
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>
                <code>{preview.owner}</code>
              </dd>
            </div>
            <div>
              <dt>Mining contract</dt>
              <dd>
                <a
                  href={`${EXPLORER}/address/${ADDRESSES.mining}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <code>{ADDRESSES.mining}</code>
                  <ExternalLink size={13} />
                </a>
              </dd>
            </div>
            {preview.kind === "merge" && (
              <>
                <div>
                  <dt>Combined active power now</dt>
                  <dd>{preview.previousPower?.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>SQK preserved · testnet</dt>
                  <dd>{exactAmount(preview.reward)}</dd>
                </div>
                <div>
                  <dt>Survivor active after merge</dt>
                  <dd>
                    {preview.previousPower?.toLocaleString()} until new power
                    activates
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt>
                <Fuel size={14} />
                Gas limit (20% buffer)
              </dt>
              <dd>{preview.gas.toLocaleString()} units</dd>
            </div>
            <div>
              <dt>Maximum network fee</dt>
              <dd>{exactAmount(preview.gasCost)} testnet ETH</dd>
            </div>
            <div>
              <dt>Snapshot</dt>
              <dd>Ethereum block {preview.snapshot.blockNumber.toString()}</dd>
            </div>
          </dl>
          {preview.kind === "merge" && phase === "review" && (
            <div className="burn-warning">
              <AlertTriangle size={20} />
              <div>
                <strong>DONOR NFT WILL BE PERMANENTLY BURNED.</strong>
                <p>
                  Squeek #{preview.ids[1].toString()} and its artwork cannot be
                  recovered. Squeek #{preview.ids[0].toString()} keeps its ID
                  and image.
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  I understand that donor #{preview.ids[1].toString()} will be
                  burned.
                </label>
              </div>
            </div>
          )}
          {phase === "review" && (
            <>
              <p className="small muted">
                The simulated reward can change before inclusion. Your wallet
                shows the final network fee. This preview expires after two
                minutes.
              </p>
              {expired && (
                <p className="notice warning" role="alert">
                  Preview expired. Close and prepare again.
                </p>
              )}
              <button
                className={`button full ${preview.kind === "merge" ? "danger" : "primary"}`}
                disabled={expired || (preview.kind === "merge" && !ack)}
                onClick={() => void confirm()}
              >
                {preview.kind === "claim"
                  ? "Confirm claim in wallet"
                  : "Confirm permanent merge"}
                <ExternalLink size={16} />
              </button>
            </>
          )}
        </>
      )}
      {hash && (
        <div className="transaction-hash">
          <span>
            {phase === "pending" ? (
              <>
                <LoaderCircle size={16} className="spin" />
                Waiting for 2 confirmations
              </>
            ) : receipt ? (
              `Confirmed in block ${receipt.blockNumber}`
            ) : (
              "Submitted transaction"
            )}
          </span>
          <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
            <code>{hash}</code>
            <ExternalLink size={16} />
          </a>
        </div>
      )}
      {phase === "success" && (
        <>
          <p className="notice success">
            <Check size={18} />
            Receipt and expected contract events verified. Your collection is
            refreshing.
          </p>
          <button className="button primary full" onClick={onClose}>
            Back to my Squeeks
          </button>
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {phase === "tracking-error" && hash && preview && (
        <button
          className="button primary full"
          onClick={() => void track(hash, preview)}
        >
          Check receipt again
        </button>
      )}
      {phase === "error" && (
        <button className="button secondary full" onClick={onClose}>
          Close and return
        </button>
      )}
    </Modal>
  );
}
