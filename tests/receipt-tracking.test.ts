// Synthetic JSON-RPC fixtures exercise the same viem receipt waiter used by the UI.
// These are not signed transactions and are never sent to a real RPC.
import test from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, custom, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { ADDRESSES } from "../src/chain/config";
const hash = ("0x" + "11".repeat(32)) as Hex;
const blockHash = ("0x" + "22".repeat(32)) as Hex;
const receipt = {
  transactionHash: hash,
  transactionIndex: "0x0",
  blockHash,
  blockNumber: "0x64",
  from: ADDRESSES.core,
  to: ADDRESSES.mining,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  contractAddress: null,
  logs: [],
  logsBloom: "0x" + "00".repeat(256),
  status: "0x1",
  effectiveGasPrice: "0x1",
  type: "0x2",
};
test("receipt waiter waits for two confirmations", async () => {
  let head = 100;
  let receiptReads = 0;
  const client = createPublicClient({
    chain: sepolia,
    pollingInterval: 5,
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_getTransactionReceipt") {
          receiptReads++;
          return receipt;
        }
        if (method === "eth_blockNumber") return "0x" + (head++).toString(16);
        if (method === "eth_getBlockByNumber")
          return {
            number: "0x" + (head++).toString(16),
            hash: blockHash,
            transactions: [],
          };
        throw new Error(`Unexpected fixture method: ${method}`);
      },
    }),
  });
  const result = await client.waitForTransactionReceipt({
    hash,
    confirmations: 2,
    timeout: 3000,
    pollingInterval: 5,
  });
  assert.equal(result.transactionHash, hash);
  assert.equal(result.status, "success");
  assert.ok(head >= 102);
  assert.ok(receiptReads >= 1);
});
test("receipt waiter retains an included revert for the app to report", async () => {
  const client = createPublicClient({
    chain: sepolia,
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_getTransactionReceipt")
          return { ...receipt, status: "0x0" };
        if (method === "eth_blockNumber") return "0x65";
        throw new Error(`Unexpected fixture method: ${method}`);
      },
    }),
  });
  const result = await client.waitForTransactionReceipt({
    hash,
    confirmations: 2,
    timeout: 1000,
  });
  assert.equal(result.status, "reverted");
});
