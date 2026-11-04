import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bolt, Check, Clock3, ImageOff, LoaderCircle } from "lucide-react";
import { loadArtwork, type Squeek } from "../chain/portfolio";
import { eligibility } from "../chain/actions";
import { EXPLORER, ADDRESSES, type ReadClient } from "../chain/config";
import type { Verification } from "../chain/verify";
import { amount } from "../lib/format";
export function NftCard({
  nft,
  snapshot,
  client,
  selected,
  onSelect,
  disabled = false,
}: {
  nft: Squeek;
  snapshot: Verification;
  client: ReadClient;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const art = useQuery({
    queryKey: ["art", ADDRESSES.nft, nft.id.toString()],
    queryFn: () => loadArtwork(client, nft.id),
    staleTime: Infinity,
    retry: false,
  });
  const [failed, setFailed] = useState(false);
  const reason = eligibility(nft, snapshot.policy, snapshot.state.blockHeight);
  return (
    <article className={`nft-card ${selected ? "selected" : ""}`}>
      <div className="nft-art">
        {art.data && !failed ? (
          <img
            src={art.data}
            alt={`Onchain artwork for Squeek #${nft.id}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="art-unavailable">
            {art.isPending ? <LoaderCircle className="spin" /> : <ImageOff />}
            <span>
              {art.isPending ? "Loading onchain art" : "Artwork unavailable"}
            </span>
          </div>
        )}
        <span className="level-badge">Level {nft.position.level}</span>
        <label className="nft-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            disabled={disabled && !selected}
            aria-label={`Select Squeek #${nft.id}`}
          />
          <span aria-hidden="true">{selected && <Check size={16} />}</span>
        </label>
      </div>
      <div className="nft-details">
        <div className="nft-title">
          <h3>Squeek #{nft.id.toString()}</h3>
          <a
            href={`${EXPLORER}/nft/${ADDRESSES.nft}/${nft.id}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`View Squeek #${nft.id} on Etherscan`}
          >
            ↗
          </a>
        </div>
        <dl className="nft-data">
          <div>
            <dt>Active power</dt>
            <dd>
              <Bolt size={13} />
              {nft.position.activeWeight.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>Pending power</dt>
            <dd>{nft.position.pendingWeight.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Claimable SQK</dt>
            <dd>{amount(nft.claimable)}</dd>
          </div>
        </dl>
        <div className={`nft-status ${reason ? "muted" : "good-text"}`}>
          {reason ? <Clock3 size={14} /> : <Check size={14} />}
          <span>{reason || "Ready to merge"}</span>
        </div>
      </div>
    </article>
  );
}
