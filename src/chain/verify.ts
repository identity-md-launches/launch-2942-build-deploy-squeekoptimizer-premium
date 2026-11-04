import { getAddress, keccak256, parseAbi, type Address, type Hex } from "viem";
import {
  ADDRESSES,
  coreAbi,
  miningAbi,
  nftAbi,
  tokenAbi,
  deployment,
  type ReadClient,
} from "./config";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ownerAbi = parseAbi(["function owner() view returns (address)"]);
export const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
function requireMatch(condition: boolean, message: string): asserts condition {
  if (!condition)
    throw new Error(
      `Contract verification stopped: ${message}. Writes are disabled.`,
    );
}
function slotAddress(word: Hex | undefined): Address {
  requireMatch(!!word && word.length === 66, "missing proxy storage slot");
  return getAddress(`0x${word.slice(-40)}`);
}
export async function verifyDeployment(client: ReadClient, atBlock?: bigint) {
  const chainId = await client.getChainId();
  requireMatch(
    chainId === deployment.chainId,
    "RPC is not Ethereum Sepolia (11155111)",
  );
  const block = await client.getBlock(
    atBlock === undefined ? { blockTag: "latest" } : { blockNumber: atBlock },
  );
  const blockNumber = block.number;
  requireMatch(
    blockNumber !== null && !!block.hash,
    "snapshot block unavailable",
  );
  const proxies = [
    {
      name: "Core",
      address: ADDRESSES.core,
      expected: deployment.contracts.SqueekCore,
      abi: coreAbi,
    },
    {
      name: "Mining",
      address: ADDRESSES.mining,
      expected: deployment.contracts.SqueekMining,
      abi: miningAbi,
    },
  ] as const;
  const identities = await Promise.all(
    proxies.map(async ({ name, address, expected, abi }) => {
      const [implementationSlot, adminSlot, reported, version, layout] =
        await Promise.all([
          client.getStorageAt({
            address,
            slot: IMPLEMENTATION_SLOT,
            blockNumber,
          }),
          client.getStorageAt({ address, slot: ADMIN_SLOT, blockNumber }),
          client.readContract({
            address,
            abi,
            functionName: "implementationCodeAddress",
            blockNumber,
          }),
          client.readContract({
            address,
            abi,
            functionName: "implementationCodeVersion",
            blockNumber,
          }),
          client.readContract({
            address,
            abi,
            functionName: "implementationStorageLayoutDigest",
            blockNumber,
          }),
        ]);
      const implementation = slotAddress(implementationSlot);
      const admin = slotAddress(adminSlot);
      requireMatch(
        sameAddress(implementation, expected.implementation),
        `${name} implementation changed`,
      );
      requireMatch(
        sameAddress(reported, implementation),
        `${name} self-reported implementation differs`,
      );
      requireMatch(
        sameAddress(admin, expected.proxyAdmin),
        `${name} proxy admin changed`,
      );
      requireMatch(
        layout.toLowerCase() === expected.storageLayoutDigest,
        `${name} storage layout differs`,
      );
      requireMatch(
        version === BigInt(expected.implementationVersion),
        `${name} version differs`,
      );
      const [code, owner] = await Promise.all([
        client.getCode({ address: implementation, blockNumber }),
        client.readContract({
          address: admin,
          abi: ownerAbi,
          functionName: "owner",
          blockNumber,
        }),
      ]);
      requireMatch(
        !!code &&
          keccak256(code).toLowerCase() === expected.implementationRuntimeHash,
        `${name} runtime hash differs`,
      );
      requireMatch(
        sameAddress(owner, deployment.operational.governanceTimelock.address),
        `${name} governance differs`,
      );
      return {
        name,
        implementation,
        admin,
        version,
        runtimeHash: keccak256(code),
        layout,
      };
    }),
  );
  const [
    miningCore,
    tokenMining,
    nftMining,
    nftGovernance,
    policy,
    configuration,
    state,
    miningConfiguration,
    decimals,
    nftCode,
    tokenCode,
  ] = await Promise.all([
    client.readContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "core",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.token,
      abi: tokenAbi,
      functionName: "mining",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.nft,
      abi: nftAbi,
      functionName: "mining",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.nft,
      abi: nftAbi,
      functionName: "governance",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "collectionPolicy",
      args: [0],
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.core,
      abi: coreAbi,
      functionName: "configuration",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.core,
      abi: coreAbi,
      functionName: "state",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "configuration",
      blockNumber,
    }),
    client.readContract({
      address: ADDRESSES.token,
      abi: tokenAbi,
      functionName: "decimals",
      blockNumber,
    }),
    client.getCode({ address: ADDRESSES.nft, blockNumber }),
    client.getCode({ address: ADDRESSES.token, blockNumber }),
  ]);
  requireMatch(
    !!nftCode && nftCode !== "0x" && !!tokenCode && tokenCode !== "0x",
    "NFT or SQK code is missing",
  );
  requireMatch(
    sameAddress(miningCore, ADDRESSES.core) &&
      sameAddress(tokenMining, ADDRESSES.mining) &&
      sameAddress(nftMining, ADDRESSES.mining) &&
      sameAddress(policy.nft, ADDRESSES.nft),
    "contract graph differs",
  );
  requireMatch(
    sameAddress(
      nftGovernance,
      deployment.operational.governanceTimelock.address,
    ),
    "NFT governance differs",
  );
  requireMatch(
    sameAddress(miningConfiguration.token, ADDRESSES.token) &&
      sameAddress(miningConfiguration.genesisCollection, ADDRESSES.nft),
    "Mining configuration differs",
  );
  const expected = deployment.coreConfiguration;
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    const actual = configuration[key];
    requireMatch(
      String(actual).toLowerCase() === String(expected[key]).toLowerCase(),
      `Core configuration ${key} differs`,
    );
  }
  requireMatch(
    state.blockHeight ===
      state.cumulativeBlockUnits / configuration.blockUnitsPerBlock &&
      state.blockProgress ===
        state.cumulativeBlockUnits % configuration.blockUnitsPerBlock,
    "Core block accounting is inconsistent",
  );
  requireMatch(decimals === 18, "SQK decimals changed");
  await assertSnapshot(client, blockNumber, block.hash);
  return {
    blockNumber,
    blockHash: block.hash,
    timestamp: block.timestamp,
    identities,
    policy,
    state,
    decimals,
    configuration,
  };
}
export type Verification = Awaited<ReturnType<typeof verifyDeployment>>;
export async function assertSnapshot(
  client: ReadClient,
  blockNumber: bigint,
  hash: Hex,
) {
  const block = await client.getBlock({ blockNumber });
  requireMatch(
    block.hash === hash,
    "snapshot was reorganized; refresh and prepare again",
  );
}
