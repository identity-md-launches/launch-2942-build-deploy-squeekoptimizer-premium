import test from "node:test";
import assert from "node:assert/strict";
import { discoverOwned } from "../src/chain/portfolio";
import { ADDRESSES, type ReadClient } from "../src/chain/config";
import type { Verification } from "../src/chain/verify";
const snapshot = {
  blockNumber: 11902300n,
  blockHash: "0x" + "aa".repeat(32),
} as Verification;
const owner = ADDRESSES.core; // Test fixture address, not a connected production account.
const indexed = (ids: string[]) => ({
  status: "1",
  result: ids.map((tokenID) => ({
    tokenID,
    contractAddress: ADDRESSES.nft,
    blockNumber: "11902290",
    from: ADDRESSES.nft,
    to: owner,
  })),
});
function client(balance: bigint, logs = false) {
  return {
    readContract: async ({
      functionName,
      args,
    }: {
      functionName: string;
      args: unknown[];
    }) => {
      if (functionName === "balanceOf") return balance;
      if (functionName === "ownerOf")
        return BigInt(args[0] as bigint) <= balance ? owner : ADDRESSES.nft;
      throw Error("Unexpected fixture read");
    },
    getBlock: async () => ({ hash: snapshot.blockHash }),
    getLogs: async ({ args }: { args: { to?: string } }) => {
      if (!logs) throw Error("RPC history unavailable");
      return args.to
        ? [1n, 2n].map((tokenId, i) => ({
            blockNumber: 11902290n,
            blockHash: snapshot.blockHash,
            transactionHash: "0x" + "bb".repeat(32),
            logIndex: i,
            args: { to: owner, from: ADDRESSES.nft, tokenId },
          }))
        : [];
    },
  } as unknown as ReadClient;
}
test("indexed candidates are deduplicated and checked against live owners and balance", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(indexed(["2", "1", "2", "3"])));
  try {
    assert.deepEqual(await discoverOwned(client(2n), owner, snapshot), [
      1n,
      2n,
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test("verified zero balance short-circuits history indexing", async () => {
  const original = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw Error("Should not fetch");
  };
  try {
    assert.deepEqual(await discoverOwned(client(0n), owner, snapshot), []);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = original;
  }
});
test("truncated index falls back to indexed RPC Transfer events", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(indexed(["1"])));
  try {
    assert.deepEqual(await discoverOwned(client(2n, true), owner, snapshot), [
      1n,
      2n,
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test("indexer and RPC failure never becomes an empty wallet", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("Indexer unavailable");
  };
  try {
    await assert.rejects(
      discoverOwned(client(2n), owner, snapshot),
      /No complete ownership list/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("reorganized snapshots are rejected", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(indexed(["1", "2"])));
  const c = client(2n, true);
  c.getBlock = async () => ({ hash: "0x" + "cc".repeat(32) }) as never;
  try {
    await assert.rejects(
      discoverOwned(c, owner, snapshot),
      /snapshot was reorganized/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
