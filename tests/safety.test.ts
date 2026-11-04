import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Log,
  type TransactionReceipt,
} from "viem";
import {
  normalizeClaimIds,
  mergeProblems,
  eligibility,
  verifyReceiptEvents,
  revalidatePreview,
  type ActionPreview,
} from "../src/chain/actions";
import { safeAssetUrl, type Squeek } from "../src/chain/portfolio";
import { verifyDeployment, type Verification } from "../src/chain/verify";
import {
  ADDRESSES,
  miningAbi,
  nftAbi,
  type ReadClient,
} from "../src/chain/config";
import { amount } from "../src/lib/format";
const policy: Verification["policy"] = {
  nft: ADDRESSES.nft,
  maxSupply: 9999,
  maximumLevel: 10,
  levels: [
    { weight: 1000n, cooldownBlocks: 2n },
    { weight: 3000n, cooldownBlocks: 4n },
  ],
};
const nft = (
  id: bigint,
  overrides: Partial<Squeek["position"]> = {},
): Squeek => ({
  id,
  claimable: 0n,
  position: {
    activeWeight: 1000n,
    pendingWeight: 0n,
    pendingRound: 0,
    nextMergeBlock: 20,
    level: 1,
    lastIndex: 0n,
    accruedScaled: 0n,
    ...overrides,
  },
});
test("claims deduplicate and sort numerically without bigint precision loss", () =>
  assert.deepEqual(normalizeClaimIds([9007199254740993n, 10n, 2n, 10n]), [
    2n,
    10n,
    9007199254740993n,
  ]));
test("claims accept exactly 32 IDs", () =>
  assert.equal(
    normalizeClaimIds(Array.from({ length: 32 }, (_, i) => BigInt(i + 1)))
      .length,
    32,
  ));
test("claims reject empty, oversized and negative batches", () => {
  assert.throws(() => normalizeClaimIds([]));
  assert.throws(() =>
    normalizeClaimIds(Array.from({ length: 33 }, (_, i) => BigInt(i))),
  );
  assert.throws(() => normalizeClaimIds([-1n]));
});
test("eligible same-level pair accepts cooldown equality", () =>
  assert.deepEqual(mergeProblems(nft(1n), nft(2n), policy, 20n), []));
test("self merge is rejected", () =>
  assert.match(
    mergeProblems(nft(1n), nft(1n), policy, 20n).join(" "),
    /different/,
  ));
test("different levels are rejected", () =>
  assert.match(
    mergeProblems(nft(1n), nft(2n, { level: 2 }), policy, 20n).join(" "),
    /same level/,
  ));
test("maximum level on either side is rejected", () =>
  assert.match(
    mergeProblems(nft(1n), nft(2n, { level: 10 }), policy, 20n).join(" "),
    /maximum/,
  ));
test("burned mining position is rejected", () =>
  assert.match(
    mergeProblems(nft(1n, { level: 0 }), nft(2n), policy, 20n).join(" "),
    /live position/,
  ));
test("pending activation on survivor or donor is rejected", () => {
  assert.match(
    mergeProblems(nft(1n, { pendingRound: 40 }), nft(2n), policy, 20n).join(
      " ",
    ),
    /#1: power is pending/,
  );
  assert.match(
    mergeProblems(nft(1n), nft(2n, { pendingRound: 40 }), policy, 20n).join(
      " ",
    ),
    /#2: power is pending/,
  );
});
test("cooldown compares completed Squeek blocks as bigint", () =>
  assert.match(
    mergeProblems(nft(1n), nft(2n, { nextMergeBlock: 21 }), policy, 20n).join(
      " ",
    ),
    /1 completed Squeek blocks/,
  ));
test("single NFT eligibility explains unavailable actions", () => {
  assert.equal(
    eligibility(nft(1n, { level: 10 }), policy, 20n),
    "Maximum level",
  );
  assert.match(
    eligibility(nft(1n, { pendingRound: 5 }), policy, 20n)!,
    /Activation pending/,
  );
  assert.match(eligibility(nft(1n), policy, 19n)!, /1 Squeek blocks/);
  assert.equal(eligibility(nft(1n), policy, 20n), undefined);
});
test("metadata rejects active URL protocols", () => {
  assert.equal(safeAssetUrl("javascript:alert(1)"), undefined);
  assert.equal(safeAssetUrl("file:///etc/passwd"), undefined);
  assert.equal(safeAssetUrl("data:text/html,<script/>"), undefined);
  assert.equal(safeAssetUrl("http://example.com/image.png"), undefined);
});
test("metadata supports isolated image data, HTTPS and IPFS", () => {
  assert.equal(safeAssetUrl("ipfs://ipfs/abc"), "https://ipfs.io/ipfs/abc");
  assert.equal(
    safeAssetUrl("https://example.com/a.png"),
    "https://example.com/a.png",
  );
  assert.ok(safeAssetUrl("data:image/svg+xml;base64,PHN2Zy8+"));
});
test("display never converts token bigint to number", () => {
  assert.equal(
    amount(9007199254740993123456789000000000n),
    "9,007,199,254,740,993.1234",
  );
  assert.equal(amount(undefined), "—");
  assert.equal(amount(1n), "<0.0001");
});
test("RPC chain mismatch fails closed before any code read", async () => {
  await assert.rejects(
    verifyDeployment({ getChainId: async () => 1 } as ReadClient),
    /Writes are disabled/,
  );
});
test("expired previews fail before network access", async () => {
  await assert.rejects(
    revalidatePreview(
      {} as ReadClient,
      { createdAt: Date.now() - 121000 } as ActionPreview,
    ),
    /expired/,
  );
});
const owner = ADDRESSES.core; // Known address, used only as an event fixture. No keys or signatures.
const claimLog = (): Log =>
  ({
    address: ADDRESSES.mining,
    topics: encodeEventTopics({
      abi: miningAbi,
      eventName: "RewardsClaimed",
      args: { owner, collection: 0 },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256[]" }],
      [1200n, 0n, [1n, 2n]],
    ),
    blockHash: "0x" + "11".repeat(32),
    blockNumber: 1n,
    transactionHash: "0x" + "22".repeat(32),
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  }) as Log;
const receipt = (logs: Log[], status = "success") =>
  ({ logs, status }) as TransactionReceipt;
test("successful claim requires matching contract, owner and complete IDs", () => {
  const p = { kind: "claim" as const, owner, ids: [1n, 2n] };
  assert.deepEqual(verifyReceiptEvents(receipt([claimLog()]), p), {
    verified: true,
    actualReward: 1200n,
  });
  assert.equal(
    verifyReceiptEvents(receipt([claimLog()]), { ...p, ids: [1n] }).verified,
    false,
  );
  assert.equal(
    verifyReceiptEvents(receipt([{ ...claimLog(), address: ADDRESSES.nft }]), p)
      .verified,
    false,
  );
});
test("reverted receipt cannot report success", () =>
  assert.throws(
    () =>
      verifyReceiptEvents(receipt([], "reverted"), {
        kind: "claim",
        owner,
        ids: [1n],
      }),
    /reverted/,
  ));
test("a successful receipt without expected events stays unverified", () =>
  assert.equal(
    verifyReceiptEvents(receipt([]), { kind: "merge", owner, ids: [1n, 2n] })
      .verified,
    false,
  ));
test("merge confirmation requires both the merged event and donor burn", () => {
  const merged: Log = {
    ...claimLog(),
    topics: encodeEventTopics({
      abi: miningAbi,
      eventName: "PositionsMerged",
      args: { collection: 0, survivor: 1n, donor: 2n },
    }),
    data: encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint256" },
      ],
      [2, 40n, 30n, 2000n, 3000n, 0n],
    ),
  };
  const burn: Log = {
    ...claimLog(),
    address: ADDRESSES.nft,
    topics: encodeEventTopics({
      abi: nftAbi,
      eventName: "Transfer",
      args: {
        from: owner,
        to: "0x0000000000000000000000000000000000000000",
        tokenId: 2n,
      },
    }),
    data: "0x",
  };
  const p = { kind: "merge" as const, owner, ids: [1n, 2n] };
  assert.equal(verifyReceiptEvents(receipt([merged]), p).verified, false);
  assert.equal(verifyReceiptEvents(receipt([merged, burn]), p).verified, true);
});
