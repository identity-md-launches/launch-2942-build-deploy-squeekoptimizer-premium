import { writeFileSync } from "node:fs";
import { parseAbiItem, type Address } from "viem";
import {
  ADDRESSES,
  makeClient,
  nftAbi,
  miningAbi,
  PUBLIC_RPC,
} from "../src/chain/config";
import { verifyDeployment } from "../src/chain/verify";
import { readPortfolio, loadArtwork } from "../src/chain/portfolio";
import {
  eligibility,
  mergeProblems,
  prepareAction,
} from "../src/chain/actions";
const client = makeClient();
const snapshot = await verifyDeployment(client);
const transfers = await client.getLogs({
  address: ADDRESSES.nft,
  event: parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ),
  fromBlock: snapshot.blockNumber - 20_000n,
  toBlock: snapshot.blockNumber,
  strict: true,
});
let holder: Address | undefined;
for (const owner of [...new Set(transfers.map((t) => t.args.to))]
  .reverse()
  .filter((a) => !/^0x0{40}$/i.test(a))) {
  const balance = await client.readContract({
    address: ADDRESSES.nft,
    abi: nftAbi,
    functionName: "balanceOf",
    args: [owner],
    blockNumber: snapshot.blockNumber,
  });
  if (balance >= 2n && balance <= 12n) {
    holder = owner;
    break;
  }
}
if (!holder) {
  for (let id = 1n; id <= 30n; id++) {
    try {
      const owner = await client.readContract({
        address: ADDRESSES.nft,
        abi: nftAbi,
        functionName: "ownerOf",
        args: [id],
        blockNumber: snapshot.blockNumber,
      });
      const balance = await client.readContract({
        address: ADDRESSES.nft,
        abi: nftAbi,
        functionName: "balanceOf",
        args: [owner],
        blockNumber: snapshot.blockNumber,
      });
      if (balance > 0n && balance <= 12n) {
        holder = owner;
        break;
      }
    } catch {
      /* burned IDs can revert */
    }
  }
}
if (!holder) throw new Error("No small live holder found in bounded scan");
console.log("Live holder found", holder);
const portfolio = await readPortfolio(client, holder, snapshot, (p) =>
  console.log("Index blocks", p.scanned.toString(), p.total.toString()),
);
console.log(
  "Discovered NFTs",
  portfolio.nfts.map((n) => n.id.toString()),
);
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  source: PUBLIC_RPC,
  blockNumber: snapshot.blockNumber,
  blockHash: snapshot.blockHash,
  holder,
  portfolio,
  transactionsSent: 0,
};
const art = await loadArtwork(client, portfolio.nfts[0].id);
report.artwork = {
  tokenId: portfolio.nfts[0].id,
  available: !!art,
  format: art?.slice(0, 35),
};
try {
  report.claimPreview = await prepareAction(
    client,
    "claim",
    portfolio.nfts.slice(0, 32).map((n) => n.id),
    holder,
  );
} catch (e) {
  report.claimLimitation = String(e);
}
const ready = portfolio.nfts.filter(
  (n) => !eligibility(n, snapshot.policy, snapshot.state.blockHeight),
);
let pair: bigint[] | undefined;
for (const a of ready) {
  for (const b of ready) {
    if (
      !mergeProblems(a, b, snapshot.policy, snapshot.state.blockHeight).length
    ) {
      pair = [a.id, b.id];
      break;
    }
  }
  if (pair) break;
}
if (pair) {
  try {
    report.mergePreview = await prepareAction(client, "merge", pair, holder);
  } catch (e) {
    report.mergeLimitation = String(e);
  }
} else
  report.mergeLimitation =
    "This holder has no eligible same-level pair at the sampled block.";
const empty = ADDRESSES.token;
const emptyBalance = await client.readContract({
  address: ADDRESSES.nft,
  abi: nftAbi,
  functionName: "balanceOf",
  args: [empty],
  blockNumber: snapshot.blockNumber,
});
if (emptyBalance === 0n) {
  const p = await readPortfolio(client, empty, snapshot);
  report.emptyWalletRead = {
    address: empty,
    balance: emptyBalance,
    nfts: p.nfts.length,
  };
}
const position = await client.readContract({
  address: ADDRESSES.mining,
  abi: miningAbi,
  functionName: "position",
  args: [0, portfolio.nfts[0].id],
  blockNumber: snapshot.blockNumber,
});
report.positionRead = position;
writeFileSync(
  "artifacts/live-read-validation.json",
  JSON.stringify(
    report,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log("Saved artifacts/live-read-validation.json; no transactions sent.");
