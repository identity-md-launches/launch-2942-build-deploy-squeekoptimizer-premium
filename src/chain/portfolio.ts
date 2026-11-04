import {
  BaseError,
  ContractFunctionRevertedError,
  parseAbiItem,
  type Address,
} from "viem";
import {
  ADDRESSES,
  FIRST_BLOCK,
  miningAbi,
  nftAbi,
  tokenAbi,
  type ReadClient,
} from "./config";
import { assertSnapshot, sameAddress, type Verification } from "./verify";
const transfer = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);
export type Position = {
  activeWeight: bigint;
  pendingWeight: bigint;
  pendingRound: number;
  nextMergeBlock: number;
  level: number;
  lastIndex: bigint;
  accruedScaled: bigint;
};
export type Squeek = { id: bigint; position: Position; claimable: bigint };
export type Portfolio = {
  nfts: Squeek[];
  eth: bigint;
  sqk: bigint;
  claimable: bigint;
  snapshot: Verification;
  owner: Address;
};
export type ScanProgress = {
  scanned: bigint;
  total: bigint;
  source?: "indexer";
};
async function mapLimit<T, R>(
  items: T[],
  run: (item: T) => Promise<R>,
  limit = 6,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await run(items[i]);
      }
    }),
  );
  return results;
}
export const TRANSFER_INDEXER = "https://eth-sepolia.blockscout.com/api";
async function validateCandidates(
  client: ReadClient,
  ids: bigint[],
  owner: Address,
  blockNumber: bigint,
  balance: bigint,
) {
  const owners = await mapLimit(ids, async (id) => {
    try {
      return await client.readContract({
        address: ADDRESSES.nft,
        abi: nftAbi,
        functionName: "ownerOf",
        args: [id],
        blockNumber,
      });
    } catch (error) {
      const revert =
        error instanceof BaseError
          ? error.walk((e) => e instanceof ContractFunctionRevertedError)
          : undefined;
      if (
        revert instanceof ContractFunctionRevertedError &&
        revert.data?.errorName === "ERC721NonexistentToken"
      )
        return undefined;
      throw error;
    }
  });
  const owned = ids.filter(
    (_, i) => !!owners[i] && sameAddress(owners[i]!, owner),
  );
  if (BigInt(owned.length) !== balance)
    throw new Error(
      "Indexed Transfer events and live NFT balance disagree. Refresh to rebuild the snapshot; actions remain disabled until discovery is complete.",
    );
  return owned;
}
async function indexedTransfers(
  client: ReadClient,
  owner: Address,
  blockNumber: bigint,
  balance: bigint,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
) {
  const ids = new Set<bigint>();
  for (let page = 1; page <= 100; page++) {
    signal?.throwIfAborted();
    const params = new URLSearchParams({
      module: "account",
      action: "tokennfttx",
      address: owner,
      contractaddress: ADDRESSES.nft,
      startblock: FIRST_BLOCK.toString(),
      endblock: blockNumber.toString(),
      page: String(page),
      offset: "1000",
      sort: "asc",
    });
    const response = await fetch(`${TRANSFER_INDEXER}?${params}`, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Transfer indexer unavailable");
    const data = (await response.json()) as {
      result?: unknown;
      status?: string;
    };
    if (!Array.isArray(data.result))
      throw new Error("Transfer indexer returned an unsupported response");
    for (const item of data.result) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.contractAddress !== "string" ||
        !sameAddress(item.contractAddress, ADDRESSES.nft) ||
        typeof item.tokenID !== "string" ||
        !/^\d+$/.test(item.tokenID) ||
        typeof item.blockNumber !== "string" ||
        !/^\d+$/.test(item.blockNumber)
      )
        throw new Error("Invalid indexed transfer");
      if (
        BigInt(item.blockNumber) > blockNumber ||
        BigInt(item.blockNumber) < FIRST_BLOCK
      )
        continue;
      if (
        typeof item.from !== "string" ||
        typeof item.to !== "string" ||
        (!sameAddress(item.from, owner) && !sameAddress(item.to, owner))
      )
        throw new Error("Transfer indexer returned unrelated events");
      ids.add(BigInt(item.tokenID));
    }
    onProgress?.({ scanned: BigInt(page), total: 0n, source: "indexer" });
    if (data.result.length < 1000)
      return validateCandidates(
        client,
        [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        owner,
        blockNumber,
        balance,
      );
  }
  throw new Error(
    "Indexed history exceeds the supported page limit; use a Sepolia RPC with full history.",
  );
}
export async function discoverOwned(
  client: ReadClient,
  owner: Address,
  snapshot: Verification,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<bigint[]> {
  const { blockNumber, blockHash } = snapshot;
  const balance = await client.readContract({
    address: ADDRESSES.nft,
    abi: nftAbi,
    functionName: "balanceOf",
    args: [owner],
    blockNumber,
  });
  if (balance === 0n) return [];
  // Indexer data only proposes IDs. Contract ownerOf and balanceOf establish ownership.
  try {
    const indexed = await indexedTransfers(
      client,
      owner,
      blockNumber,
      balance,
      onProgress,
      signal,
    );
    await assertSnapshot(client, blockNumber, blockHash);
    return indexed;
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const ids = new Set<bigint>();
  let from = FIRST_BLOCK;
  let span = 40_000n;
  while (from <= blockNumber) {
    signal?.throwIfAborted();
    const to = from + span - 1n > blockNumber ? blockNumber : from + span - 1n;
    try {
      // Both indexed directions are replayed in chain order, then ownerOf is the final authority.
      const [received, sent] = await Promise.all([
        client.getLogs({
          address: ADDRESSES.nft,
          event: transfer,
          args: { to: owner },
          fromBlock: from,
          toBlock: to,
          strict: true,
        }),
        client.getLogs({
          address: ADDRESSES.nft,
          event: transfer,
          args: { from: owner },
          fromBlock: from,
          toBlock: to,
          strict: true,
        }),
      ]);
      const unique = new Map(
        [...received, ...sent].map((log) => [
          `${log.blockHash}:${log.transactionHash}:${log.logIndex}`,
          log,
        ]),
      );
      const logs = [...unique.values()].sort((a, b) =>
        a.blockNumber < b.blockNumber
          ? -1
          : a.blockNumber > b.blockNumber
            ? 1
            : a.logIndex - b.logIndex,
      );
      for (const log of logs) {
        if (sameAddress(log.args.to, owner)) ids.add(log.args.tokenId);
        else ids.delete(log.args.tokenId);
      }
      from = to + 1n;
      onProgress?.({
        scanned: to - FIRST_BLOCK + 1n,
        total: blockNumber - FIRST_BLOCK + 1n,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (span <= 500n)
        throw new Error(
          "Transfer indexing could not finish. No complete ownership list is available. Retry with another Sepolia RPC in Network & contracts.",
          { cause: error },
        );
      span /= 2n;
    }
  }
  const candidates = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const owned = await validateCandidates(
    client,
    candidates,
    owner,
    blockNumber,
    balance,
  );
  await assertSnapshot(client, blockNumber, blockHash);
  return owned;
}
export async function readPortfolio(
  client: ReadClient,
  owner: Address,
  snapshot: Verification,
  onProgress?: (p: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<Portfolio> {
  const blockNumber = snapshot.blockNumber;
  const [ids, eth, sqk] = await Promise.all([
    discoverOwned(client, owner, snapshot, onProgress, signal),
    client.getBalance({ address: owner, blockNumber }),
    client.readContract({
      address: ADDRESSES.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [owner],
      blockNumber,
    }),
  ]);
  const nfts = await mapLimit(ids, async (id) => {
    signal?.throwIfAborted();
    const [position, claimable] = await Promise.all([
      client.readContract({
        address: ADDRESSES.mining,
        abi: miningAbi,
        functionName: "position",
        args: [0, id],
        blockNumber,
      }),
      client.readContract({
        address: ADDRESSES.mining,
        abi: miningAbi,
        functionName: "claimable",
        args: [0, [id]],
        blockNumber,
      }),
    ]);
    if (position.level === 0)
      throw new Error(
        `Squeek #${id} has no active mining position. Refresh the snapshot.`,
      );
    return { id, position, claimable };
  });
  let claimable = 0n;
  for (let i = 0; i < ids.length; i += 32) {
    claimable += await client.readContract({
      address: ADDRESSES.mining,
      abi: miningAbi,
      functionName: "claimable",
      args: [0, ids.slice(i, i + 32)],
      blockNumber,
    });
  }
  await assertSnapshot(client, blockNumber, snapshot.blockHash);
  return { nfts, eth, sqk, claimable, snapshot, owner };
}
export function safeAssetUrl(uri: string): string | undefined {
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(uri)) return uri;
  if (uri.startsWith("ipfs://"))
    return `https://ipfs.io/ipfs/${uri.slice(7).replace(/^ipfs\//, "")}`;
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return url.href;
  } catch {
    /* invalid metadata URL */
  }
  return undefined;
}
export async function loadArtwork(
  client: ReadClient,
  id: bigint,
): Promise<string | undefined> {
  const uri = await client.readContract({
    address: ADDRESSES.nft,
    abi: nftAbi,
    functionName: "tokenURI",
    args: [id],
  });
  if (uri.length > 1_500_000)
    throw new Error("Metadata exceeds the safety limit");
  let metadata: unknown;
  if (uri.startsWith("data:application/json")) {
    const comma = uri.indexOf(",");
    const content = uri.slice(comma + 1);
    metadata = JSON.parse(
      uri.slice(0, comma).includes(";base64")
        ? atob(content)
        : decodeURIComponent(content),
    );
  } else {
    const url = safeAssetUrl(uri);
    if (!url || url.startsWith("data:"))
      throw new Error("Unsupported metadata address");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Artwork metadata is unavailable");
    const text = await response.text();
    if (text.length > 1_500_000)
      throw new Error("Metadata exceeds the safety limit");
    metadata = JSON.parse(text);
  }
  if (
    metadata &&
    typeof metadata === "object" &&
    "image" in metadata &&
    typeof metadata.image === "string"
  )
    return safeAssetUrl(metadata.image);
  return undefined;
}
