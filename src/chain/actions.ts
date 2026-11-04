import {
  encodeFunctionData,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  ADDRESSES,
  coreAbi,
  miningAbi,
  nftAbi,
  type ReadClient,
} from "./config";
import {
  assertSnapshot,
  sameAddress,
  verifyDeployment,
  type Verification,
} from "./verify";
import type { Position, Squeek } from "./portfolio";
export function normalizeClaimIds(ids: readonly bigint[]): bigint[] {
  const sorted = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.length < 1 || sorted.length > 32)
    throw new Error("Select 1–32 owned Squeeks for one claim.");
  if (sorted.some((id) => id < 0n))
    throw new Error("Token IDs must be non-negative integers.");
  return sorted;
}
export function mergeProblems(
  a: Squeek,
  b: Squeek,
  policy: Verification["policy"],
  height: bigint,
): string[] {
  const problems: string[] = [];
  if (a.id === b.id) problems.push("Choose two different NFTs.");
  if (a.position.level === 0 || b.position.level === 0)
    problems.push("Both NFTs need a live position.");
  if (a.position.level !== b.position.level)
    problems.push("Both Squeeks must be the same level.");
  if (
    a.position.level >= policy.maximumLevel ||
    b.position.level >= policy.maximumLevel
  )
    problems.push(
      `Level ${policy.maximumLevel} is the maximum and cannot merge.`,
    );
  for (const n of [a, b]) {
    if (n.position.pendingRound !== 0)
      problems.push(
        `#${n.id}: power is pending until checkpointed round ${n.position.pendingRound}.`,
      );
    if (BigInt(n.position.nextMergeBlock) > height)
      problems.push(
        `#${n.id}: ${BigInt(n.position.nextMergeBlock) - height} completed Squeek blocks of cooldown remain.`,
      );
  }
  return problems;
}
export function eligibility(
  n: Squeek,
  policy: Verification["policy"],
  height: bigint,
): string | undefined {
  if (n.position.level >= policy.maximumLevel) return "Maximum level";
  if (n.position.pendingRound !== 0)
    return `Activation pending · round ${n.position.pendingRound}`;
  if (BigInt(n.position.nextMergeBlock) > height)
    return `${BigInt(n.position.nextMergeBlock) - height} Squeek blocks remaining`;
  return undefined;
}
export type ActionPreview = {
  kind: "claim" | "merge";
  owner: Address;
  ids: bigint[];
  reward: bigint;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasCost: bigint;
  data: Hex;
  snapshot: Verification;
  createdAt: number;
  nextLevel?: number;
  nextPower?: bigint;
  previousPower?: bigint;
};
async function verifyOwners(
  client: ReadClient,
  ids: bigint[],
  owner: Address,
  blockNumber: bigint,
) {
  const owners = await Promise.all(
    ids.map((id) =>
      client.readContract({
        address: ADDRESSES.nft,
        abi: nftAbi,
        functionName: "ownerOf",
        args: [id],
        blockNumber,
      }),
    ),
  );
  owners.forEach((actual, i) => {
    if (!sameAddress(actual, owner))
      throw new Error(
        `Your connected wallet no longer owns Squeek #${ids[i]}. Refresh your collection.`,
      );
  });
}
export async function prepareAction(
  client: ReadClient,
  kind: "claim" | "merge",
  selectedIds: bigint[],
  owner: Address,
): Promise<ActionPreview> {
  const ids = kind === "claim" ? normalizeClaimIds(selectedIds) : selectedIds;
  if (kind === "merge" && (ids.length !== 2 || ids[0] === ids[1]))
    throw new Error("Choose a different survivor and donor.");
  const snapshot = await verifyDeployment(client);
  const blockNumber = snapshot.blockNumber;
  await verifyOwners(client, ids, owner, blockNumber);
  let reward = 0n;
  let nextLevel: number | undefined;
  let nextPower: bigint | undefined;
  let previousPower: bigint | undefined;
  let data: Hex;
  let rawGas: bigint;
  if (kind === "claim") {
    reward = await client.readContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "claimable",
      args: [0, ids],
      blockNumber,
    });
    const simulation = await client.simulateContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "claim",
      args: [0, ids],
      account: owner,
      blockNumber,
    });
    if (simulation.result !== reward)
      throw new Error(
        "Simulation and claimable rewards disagree. Refresh and prepare again.",
      );
    if (reward === 0n)
      throw new Error(
        "These Squeeks have no funded SQK to claim yet. A checkpoint may still be pending.",
      );
    data = encodeFunctionData({
      abi: miningAbi,
      functionName: "claim",
      args: [0, ids],
    });
    rawGas = await client.estimateContractGas({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "claim",
      args: [0, ids],
      account: owner,
      blockNumber,
    });
  } else {
    const [a, b, state, policy] = await Promise.all([
      client.readContract({
        address: ADDRESSES.mining,
        abi: miningAbi,
        functionName: "position",
        args: [0, ids[0]],
        blockNumber,
      }),
      client.readContract({
        address: ADDRESSES.mining,
        abi: miningAbi,
        functionName: "position",
        args: [0, ids[1]],
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
        functionName: "collectionPolicy",
        args: [0],
        blockNumber,
      }),
    ]);
    const issues = mergeProblems(
      { id: ids[0], position: a, claimable: 0n },
      { id: ids[1], position: b, claimable: 0n },
      policy,
      state.blockHeight,
    );
    if (issues.length) throw new Error(issues.join(" "));
    nextLevel = a.level + 1;
    nextPower = policy.levels[nextLevel - 1]?.weight;
    if (nextPower === undefined)
      throw new Error(
        "Next-level power is unavailable in the collection policy.",
      );
    previousPower = a.activeWeight + b.activeWeight;
    reward = await client.readContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "claimable",
      args: [0, normalizeClaimIds(ids)],
      blockNumber,
    });
    await client.simulateContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "merge",
      args: [0, ids[0], ids[1]],
      account: owner,
      blockNumber,
    });
    data = encodeFunctionData({
      abi: miningAbi,
      functionName: "merge",
      args: [0, ids[0], ids[1]],
    });
    rawGas = await client.estimateContractGas({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "merge",
      args: [0, ids[0], ids[1]],
      account: owner,
      blockNumber,
    });
  }
  const fees = await client.estimateFeesPerGas();
  const gas = (rawGas * 120n + 99n) / 100n;
  await assertSnapshot(client, blockNumber, snapshot.blockHash);
  return {
    kind,
    owner,
    ids,
    reward,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasCost: gas * fees.maxFeePerGas,
    data,
    snapshot,
    createdAt: Date.now(),
    nextLevel,
    nextPower,
    previousPower,
  };
}
export async function revalidatePreview(
  client: ReadClient,
  preview: ActionPreview,
) {
  // No cached verification or ownership at the signing boundary. Never silently change IDs or calldata.
  if (Date.now() - preview.createdAt > 120_000)
    throw new Error(
      "This preview expired after two minutes. Close it and prepare again.",
    );
  const fresh = await prepareAction(
    client,
    preview.kind,
    preview.ids,
    preview.owner,
  );
  if (
    fresh.data !== preview.data ||
    fresh.reward !== preview.reward ||
    fresh.nextLevel !== preview.nextLevel ||
    fresh.nextPower !== preview.nextPower ||
    fresh.maxFeePerGas > preview.maxFeePerGas ||
    fresh.gas > preview.gas
  ) {
    throw new Error(
      "Rewards, power or gas changed since this preview. Close it and prepare again to review the new values.",
    );
  }
  return fresh;
}
export function verifyReceiptEvents(
  receipt: TransactionReceipt,
  preview: Pick<ActionPreview, "kind" | "owner" | "ids">,
): { actualReward?: bigint; verified: boolean } {
  if (receipt.status !== "success")
    throw new Error(
      "The transaction reverted on Sepolia. No successful action was confirmed. Gas may have been spent.",
    );
  const miningLogs = receipt.logs.filter((log) =>
    sameAddress(log.address, ADDRESSES.mining),
  );
  if (preview.kind === "claim") {
    const logs = parseEventLogs({
      abi: miningAbi,
      eventName: "RewardsClaimed",
      logs: miningLogs,
      strict: true,
    });
    const log = logs.find(
      (log) =>
        sameAddress(log.args.owner, preview.owner) &&
        log.args.collection === 0 &&
        log.args.tokenIds.length === preview.ids.length &&
        log.args.tokenIds.every((id, i) => id === preview.ids[i]),
    );
    return { actualReward: log?.args.amount, verified: !!log };
  }
  const logs = parseEventLogs({
    abi: miningAbi,
    eventName: "PositionsMerged",
    logs: miningLogs,
    strict: true,
  });
  const merge = logs.find(
    (log) =>
      log.args.collection === 0 &&
      log.args.survivor === preview.ids[0] &&
      log.args.donor === preview.ids[1],
  );
  const burns = parseEventLogs({
    abi: nftAbi,
    eventName: "Transfer",
    logs: receipt.logs.filter((log) => sameAddress(log.address, ADDRESSES.nft)),
    strict: true,
  });
  const burned = burns.some(
    (log) =>
      log.args.tokenId === preview.ids[1] &&
      /^0x0{40}$/i.test(log.args.to) &&
      sameAddress(log.args.from, preview.owner),
  );
  return { verified: !!merge && burned };
}
export type { Position };
