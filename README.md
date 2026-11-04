# SqueekOptimizer

A working, non-custodial Squeek NFT utility for Ethereum Sepolia (chain **11155111**). Discover genuine NFTs, inspect mining positions, batch-claim testnet SQK and prepare safe, owner-approved merges. All assets are **TESTNET**.

The complete static export is in **`dist/`**, alongside React/TypeScript source and the npm lockfile. It uses relative assets and hash routes, including when served below a gateway subpath. No backend, project ID, private key, environment file or WalletConnect relay is required.

## Install, run and rebuild

Node 22.12+ or Node 24 is recommended; this submission was built with Node 24.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` runs TypeScript and Vite, replacing `dist/` with the full production export. `npm run preview` serves that export locally. Public RPCs and NFT metadata require internet access; the static application shell, fonts, favicon, branding and share card are bundled locally. A failed read never becomes a zero balance or a sample NFT.

## Wallet and owner actions

The top-right wallet control supports EIP-6963 browser providers, including MetaMask, Rabby and OKX, and legacy compatible EIP-1193 providers. It also offers Coinbase Wallet/Smart Wallet. On a phone without a provider it offers MetaMask, Coinbase, Rabby and Phantom app-browser links to the current page. Actual vendor prompts/passkey creation and physical phone app handoff were not exercised here.

Connecting requests an account, never a signature. An unsupported chain must be switched with a user action. The EIP-1193 switch helper requests Sepolia, adds its chain metadata if the wallet reports an unknown chain, and explicitly switches afterward when adding alone did not switch. Wagmi receives only the verified resulting chain. Account/network events invalidate the current selection and prepared action. Disconnect is in the account dialog and clears all active app wallet connections.

NFT discovery uses indexed ERC-721 Transfer events from Blockscout with RPC event scanning as fallback. Every candidate is checked with `ownerOf` at the snapshot block; the complete set must agree with `balanceOf`. Indexer lag, truncation, RPC failure or a reorganization cannot silently produce a completed collection. Token artwork comes from the official `tokenURI`, is treated as untrusted and is only rendered as an image.

For claims, choose 1–32 NFTs. The app deduplicates and sorts IDs numerically using `bigint`, checks every owner, reads `claimable(0, ids)`, simulates `claim(0, ids)` and estimates gas. The exact combined reward is shown before an explicit “Confirm claim in wallet.” Zero funded payouts are explained rather than submitted.

For merges, choose which NFT survives and which is burned. The app checks both owners, positions, collection policy, level maximum, pending activation and cooldown against completed Squeek block height. It simulates and estimates `merge(0, survivor, donor)` before showing the permanent burn warning. A checkbox and explicit confirmation are required before opening the wallet. The survivor retains combined active power until its higher-level pending power is activated by a checkpoint; both NFTs' unclaimed SQK stay with it.

A preview expires after two minutes. Before signing, the app repeats deployment verification, ownership reads and simulation. Changed rewards, power, calldata or a higher gas requirement invalidate the preview. It sends one user-approved transaction to the Mining proxy with zero ETH value and a reviewed gas/fee cap. There are no approval, deposit, staking, private-key or seed-phrase flows. It never automatically submits or retries a transaction.

After a returned hash, the app waits for two confirmations, checks receipt status and decodes the expected official contract events. A merge also requires the donor's NFT burn event. Only then is a result labeled confirmed and the balances/collection refreshed. Rejected, reverted, replaced, expired and unknown-receipt states remain explicit. Receipt lookup can be retried without resending. Recent activity is stored only in this browser and filtered by connected owner.

## Contracts and verification

| Contract | Official Sepolia address |
| --- | --- |
| Mining proxy | `0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4` |
| NFT | `0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6` |
| SQK | `0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76` |
| Core proxy | `0x74665dAecA35A2303e767E76a2FF1FB6F93e119f` |

The official [deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json) and four [published ABIs](https://docs.squeekchain.com/developers/) are pinned in `src/chain/`. `verify.ts` checks chain ID, EIP-1967 implementation/admin slots, implementation runtime hashes, self-reported identities/versions, storage layout digests, ProxyAdmin ownership, NFT governance, launch configuration, contract graph, bytecode presence, SQK decimals and Core block accounting at one block. The block hash is rechecked for reorganization. A mismatch disables writes; upgrades require deliberate review of the official record and ABIs.

Read-only verification can be reproduced with:

```sh
npm run verify:chain
npx --no-install tsx scripts/check-live-reads.ts
```

These scripts do not sign or broadcast. The second finds a small public holder using genuine indexed transfers, checks its real collection, loads artwork and prepares claim/merge simulations where eligible. It does not authenticate as that holder. Results are in `artifacts/deployment-verification.json` and `artifacts/live-read-validation.json`.

The default RPC is [PublicNode Sepolia](https://ethereum-sepolia-rpc.publicnode.com), with Tenderly and dRPC fallbacks. [Blockscout Sepolia](https://eth-sepolia.blockscout.com/) supplies indexed transfer candidates. Older RPC history was unavailable during validation, so the indexer path was added and tested. “Network & contracts” accepts an owner-selected HTTPS Sepolia read RPC stored locally. Custom RPC data is still subject to deployment and ownership verification.

## Actual validation

- Production build and TypeScript check passed.
- **31 automated tests passed**: bigint and batch boundaries, merge eligibility, indexer truncation/failure/reorg handling, safe metadata URLs, deployment chain guard, preview expiry, receipt event validation and two-confirmation receipt tracking.
- Live Sepolia reads verified Core v3/Mining v6 against the official record. Ten actual owned NFTs and their artwork were discovered; exact claim and merge simulations and gas estimates passed. A real zero-NFT address was read as empty.
- **22 Chromium checks passed** using the production export at `/preview/`, genuine public RPC reads and a controlled EIP-6963 provider. They cover discovery, filtering/selection, account changes, disconnect, connection rejection, Sepolia switching, claim/merge review and explicit confirmation boundaries. The test provider rejects transactions; it never signs or broadcasts.
- The final design probe passes **16/16 checks**. The first 390px screen shows the product and main action. Chromium checks cover 320, 390, 760, 990 and 1440px, local resource loading, focus return, phone wallet options and automated accessibility scans.

The complete evidence, final browser outcomes, design findings and limitations are in **[`artifacts/validation.md`](artifacts/validation.md)**. Screenshots in `artifacts/screenshots/` depict actual rendered states. The worker's checks are not independent certification.

**No transactions were signed or broadcast; there are no worker-created onchain receipts.** Receipt waiting and event verification were tested with explicitly synthetic fixtures, while the claim/merge simulations were genuine Sepolia `eth_call`/gas-estimate reads. WebKit could not launch because system libraries were missing. Safari, physical devices, real extension/passkey prompts and successful signed transaction inclusion remain unverified.

The standalone browser check is reproducible with tooling installed outside the submission:

```sh
npm install --prefix /tmp/squeek-check playwright @axe-core/playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers /tmp/squeek-check/node_modules/.bin/playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers node scripts/check-browser.mjs /tmp/squeek-check/node_modules/playwright/index.mjs /tmp/squeek-check/node_modules/@axe-core/playwright/dist/index.mjs
```

The design probe was run from the assignment's pinned inputs with `IMD_PLAYWRIGHT` pointing to that external Playwright module and `--out test/scratch/taste`. Those pinned inputs and scratch outputs are removed by the submission system; the final report is retained in `artifacts/design-probe.json`.

## Static delivery and attribution

`dist/` is the publishing deliverable. IMD's publishing plane assigns the public/IPFS URL after the submission is accepted; **no public URL was assigned in this worker session**. The local preview address is not a public deployment. No external hosting account or undocumented publishing command was used.

Built through **IMD Swarm**, job `ceb48beb-6fb5-4aaa-929a-fba9804755a8`. Attribution is visible in the app, the HTML metadata and `imd-attribution.json`. This is an independent Genesis Code utility and **does not claim Genesis approval**.

`DESIGN.md` records the implemented system and all six Better Interface review domains are covered in the validation report. Design guide, Google Fonts and RainbowKit wallet-mark notices/licenses are under `artifacts/licenses/`. Wallet marks retain their vendor colors. Local mascot, favicon and share-card artwork are original to this application. Lucide supplies UI icons.

The explicit `.gitignore` path budget is **1,024 bytes**. Its content is measured in `artifacts/submission-budget.json`. Explicit negations retain the required `artifacts/` evidence directory. It excludes generated `node_modules/`, `.vite/`, `.cache/`, `*.tsbuildinfo`, `test/scratch/` and `.playwright-mcp/`, at every nesting level where applicable. It does **not** exclude `dist/`. Dependencies and package-manager caches are not submission artifacts. `node scripts/check-budget.mjs` audits Git-visible paths and the **8,388,608-byte** cap; its final report is in `artifacts/submission-budget.json`. No submodule is used.


The explicit included-path budgets are 3 MiB for `dist/**`, 2 MiB for `artifacts/**`, and 3 MiB for all other source, manifests, documentation and public assets combined. Generated `**/node_modules/**`, `**/.vite/**`, `**/.cache/**`, `**/*.tsbuildinfo`, `test/scratch/**` and `**/.playwright-mcp/**` each have a Git-submission budget of zero bytes. The required source, runtime assets and evidence stay included. The budget script checks these allocations as well as the total.
