import { writeFileSync } from "node:fs";
import { makeClient, PUBLIC_RPC, ADDRESSES, nftAbi } from "../src/chain/config";
import { verifyDeployment } from "../src/chain/verify";
const client = makeClient();
try {
  const result = await verifyDeployment(client);
  const supply = await client.readContract({
    address: ADDRESSES.nft,
    abi: nftAbi,
    functionName: "totalSupply",
    blockNumber: result.blockNumber,
  });
  const report = {
    checkedAt: new Date().toISOString(),
    source: PUBLIC_RPC,
    chainId: 11155111,
    addresses: ADDRESSES,
    ...result,
    nftSupply: supply,
    signedTransactions: 0,
  };
  const serialized = JSON.stringify(
    report,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
  writeFileSync("artifacts/deployment-verification.json", serialized + "\n");
  console.log(serialized);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
