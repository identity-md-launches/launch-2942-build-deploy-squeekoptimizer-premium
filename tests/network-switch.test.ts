import test from "node:test";
import assert from "node:assert/strict";
import type { EIP1193Provider } from "viem";
import { switchProviderToSepolia } from "../src/chain/switchNetwork";
const provider = (
  request: (args: { method: string; params?: unknown }) => Promise<unknown>,
) => ({ request }) as Pick<EIP1193Provider, "request">;
test("known Sepolia chain switches once after explicit request", async () => {
  const calls: string[] = [];
  await switchProviderToSepolia(
    provider(async ({ method }) => {
      calls.push(method);
      return method === "eth_chainId" ? "0xaa36a7" : null;
    }),
  );
  assert.deepEqual(calls, ["wallet_switchEthereumChain", "eth_chainId"]);
});
test("unknown chain is added and explicitly switched if adding did not switch", async () => {
  const calls: string[] = [];
  let known = false;
  let chain = "0x1";
  await switchProviderToSepolia(
    provider(async ({ method, params }) => {
      calls.push(method);
      if (method === "wallet_switchEthereumChain") {
        if (!known) throw { code: 4902 };
        chain = "0xaa36a7";
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        known = true;
        assert.equal((params as [{ chainId: string }])[0].chainId, "0xaa36a7");
        return null;
      }
      return chain;
    }),
  );
  assert.deepEqual(calls, [
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "eth_chainId",
    "wallet_switchEthereumChain",
    "eth_chainId",
  ]);
});
test("adding a chain that switches immediately needs no second switch", async () => {
  let switches = 0;
  let known = false;
  await switchProviderToSepolia(
    provider(async ({ method }) => {
      if (method === "wallet_switchEthereumChain") {
        switches++;
        throw { code: 4902 };
      }
      if (method === "wallet_addEthereumChain") {
        known = true;
        return null;
      }
      return known ? "0xaa36a7" : "0x1";
    }),
  );
  assert.equal(switches, 1);
});
test("a wallet rejection is never retried or converted into add-chain", async () => {
  const calls: string[] = [];
  await assert.rejects(
    switchProviderToSepolia(
      provider(async ({ method }) => {
        calls.push(method);
        throw Object.assign(new Error("User rejected"), { code: 4001 });
      }),
    ),
    /User rejected/,
  );
  assert.deepEqual(calls, ["wallet_switchEthereumChain"]);
});
