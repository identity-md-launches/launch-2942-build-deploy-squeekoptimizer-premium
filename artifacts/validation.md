# SqueekOptimizer validation

Worker report for the production static export. These results are locally executed checks, not independent certification. Final source, `dist/`, README and DESIGN.md are included. No private key, seed phrase, funded signing account or hosting account was used.

## Outcome

| Area | Actual result |
| --- | --- |
| Production build | Passed, Vite 7.3.7; TypeScript build included |
| Standalone typecheck | Passed, `tsc --noEmit` |
| Automated safety/logic tests | **31 passed, 0 failed** |
| Chromium interaction checks | **22 passed, 0 failed** |
| WebKit | Not performed: launch failed because required system shared libraries are missing |
| Pinned taste@1 design probe | **16/16 passed** |
| Automated accessibility | Zero reported violations in the tested disconnected page and connected mobile merge dialog |
| First 390px screen | Product, Testnet label, Connect wallet and Find my Squeeks are visible |
| Live chain reads | Official deployment matches; real ownership, positions, balances, metadata, claims and merge eligibility read |
| Live transaction preparation | Genuine Sepolia claim and merge `eth_call` simulations and gas estimation passed |
| Signed transactions | **0**; no worker-created onchain receipts |
| Static hosting export | Complete in `dist/`; relative assets work under `/preview/` |
| Public URL | After worker review: assigned by the IMD publishing plane; none was assigned in this session |

The final Chromium report is timestamped `2026-11-04T03:18:08.633Z`. It used the final production export after the network-switch, disconnect and dialog fixes. The final design report and screenshot evidence were regenerated against that export. The final production build exited successfully after the last wallet integration change. Vite reports third-party pure-annotation warnings and a roughly 726 kB uncompressed main chunk; these are disclosed build warnings, not failed checks. Runtime performance profiling was not performed.

## Scope and assumptions

The app implements My Squeeks, Smart claim, Merge optimizer, Activity and Network & contracts as hash routes. It intentionally uses the official reference's light visual direction and supplies the three wallet paths specified in the pinned connector guide. No backend, indexing service owned by this app, relay or WalletConnect project ID is assumed. Public Blockscout indexing proposes candidate IDs; authoritative contract reads establish ownership.

Connected browser validation uses a controlled EIP-6963 provider exposing a genuine public holder address for reads. It lists separate extension names to test discovery and deliberately rejects signing requests. This is a test harness, not a claim that the worker controlled that holder or tested real MetaMask/Rabby/OKX extension prompts. The harness is confined to `scripts/check-browser.mjs` and never enters the production application.

## Brief coverage

| Requirement | Status and evidence |
| --- | --- |
| “Use … Genesis Code as the PRIMARY visual reference” | Met: reference inspected in a real browser; its light palette, three font families, orange dot motif and restrained controls informed an original app layout. Desktop/mobile screenshots retained. |
| “REAL EVM wallet connection” | Implemented and controlled-provider tested: wagmi, EIP-6963, legacy EIP-1193, Coinbase connector, app-browser links, account/network events and disconnect. Actual vendor prompts/passkeys remain unverified. |
| “Discover genuinely owned … using … indexed Transfer events” | Met: a public holder's ten genuine IDs were discovered and checked against ownerOf/balanceOf. Real tokenURI artwork and position/claimable reads succeeded. Zero-balance and error states were checked. |
| “1–32 … Deduplicate and sort IDs ascending” | Met: bigint normalization, boundary tests, selection UI and exact batch simulation. Browser review showed `#1, #2` after reversed selection. |
| “read claimable … simulate claim … estimate gas” | Met for live read preparation. Exact payout, contract and gas appear before one explicit wallet request. Controlled rejection creates no hash or success. |
| “Validate same level … pending activation … completed-block cooldown” | Met: live policy/Core state, negative boundary tests and same-level groups. Explicit survivor/donor selection and swapping tested. |
| “DONOR NFT WILL BE PERMANENTLY BURNED” | Met verbatim in the review. Required acknowledgement keeps confirmation disabled until checked. Mobile confirmation and full wrapping were inspected. |
| “wait for receipt and refresh balances” | Implemented: two confirmations, event checks, actual reward, burn verification, refresh, replacement handling and manual receipt lookup. Waiter/event logic tested with labeled synthetic receipts; no signed inclusion was performed. |
| “Never … private keys … unlimited approvals” | Met by source inspection and observed request counts. No key, deposit, approval, staking or signature-on-connect flow exists. Contract writes go only to the pinned Mining proxy with zero ETH value. |
| “Show network, contract, token IDs … transaction hash” | Met: review/details and pending/result components expose full addresses/hash, exact amounts, IDs, buffered gas, fee cap, status and Sepolia Etherscan links. All pages carry a Testnet badge. |
| “Build through IMD Swarm … preserve … attribution” | Met: visible attribution, HTML job metadata and `imd-attribution.json`. No Genesis approval claimed. |
| “Deploy publicly … live URL” | Static export delivered for the IMD publisher. Public pin/URL assignment was not available during the worker session; no live URL is invented. |
| Export, source, lockfile and documentation | Met: complete relative-path `dist/`, TypeScript source, npm lockfile, README, DESIGN.md and evidence are Git-visible. Dependency/cache directories are excluded. Required artifacts are explicitly included by root ignore-file negations within its documented path budget. |

No sample NFTs, seeded balances, random rewards, local-only “chain” state or fabricated transaction success is included in the production export.

## Better Interface review: all six domains

| Domain | Coverage and evidence | Explicit limits |
| --- | --- | --- |
| Accessibility | Checked native semantics, labeled selects/search/checkboxes, skip link, heading order, modal accessible names, focus indicators and native modal behavior. Browser checked Tab without focusing background controls, Escape, focus restoration, disabled merge acknowledgement, live errors and reduced-motion probe. Axe reported zero violations in two representative states. | No actual screen-reader session, physical assistive technology, native 200% zoom or full WCAG conformance audit. Browser chrome may receive focus at the native dialog's tab boundary; the test correctly excludes background app controls rather than forbidding browser chrome. |
| Layout | Checked actual production at 320, 390, 760, 990 and 1440px. No horizontal overflow in these checks. Probe found no text overlap, obscured control or hidden text. Viewed final 390/1440 screenshots and mobile merge confirmation. Native dialog scrolling keeps full data reachable. | Not every intermediate width or hardware orientation tested. English-only interface; translation and RTL variants were not introduced. |
| Writing | Checked task names, verb-first actions, distinct loading/empty/failure states, testnet labels and exact irreversible warning. Reduced four repeated slogan-style lines to one product phrase plus plain explanatory copy. | Contract/provider error text can be technical; it is shortened with recoverable RPC guidance where recognized. |
| Typography | Checked local fonts actually load, six semantic sizes, three families and three weights, 16px phone inputs, tabular numbers and wrapping of full IDs/addresses. The probe passes both type checks. | No OS-by-OS font rasterization comparison. |
| Colors | Checked role-based CSS tokens and actual solid-background probe. All measured text passes AA thresholds. Supplemented the probe's 11 image/gradient exclusions with source-based compositing calculations for the welcome dot background and both sidebar gradient endpoints; 13 documented pairs pass. | Dynamic NFT artwork is decorative content and not used behind essential text. Not every pixel of every possible metadata image is audited. No unimplemented dark theme is claimed. |
| UI details | Checked selected/hover/focus/disabled/loading/empty/error/review/confirmation states, visible action hierarchy, structural borders, isolated modal elevation, icon consistency and reduced-motion rules. Native dialogs scroll on phones; the sidebar scrolls on short desktop windows. | No animation-panel playback at 10% speed or physical touch-device test. Native behavior is used instead of an animation dependency. |

The one visual idea: an orderly holder workbench in the Genesis Code palette, carried by warm dot-grid hamster artwork and precise onchain data.

## Findings, corrections and rechecks

1. **Medium, typography: relative bold introduced weight 900.** Source `src/styles.css:2751`, `strong, b { font-weight: 700; }`. Initial probe saw four weights because the reset's `bolder` rule elevated strong text. Set the explicit existing weight. Final probe sees only 400, 600 and 700.
2. **Medium, writing: repeated two-beat copy.** Source `src/components/Pages.tsx:65` and the My Squeeks heading in `src/App.tsx`. Initial probe counted four slogan-style lines. Replaced supporting lines with “Manage your NFTs and their mining rewards,” “A non-custodial home for your Squeeks,” and “Batch rewards from up to 32 Squeeks.” Final probe counts one such product phrase and passes the copy budget.
3. **High, discovery: public RPC could not serve old Transfer history.** Source `src/chain/portfolio.ts:98` and `:173`. Actual read testing returned “pruned history unavailable”; the former RPC fallback also answered forbidden. Added the public indexed Transfer path, checked every candidate with live ownerOf, required balance agreement and retained bounded RPC scanning as fallback. Added truncation/failure/reorg tests. Live discovery and the final browser run find the ten actual owned NFTs.
4. **High, accessibility: duplicate modal label IDs.** Source `src/components/Modal.tsx:19`. The always-mounted wallet dialog and transaction dialog formerly shared one title ID. Replaced it with React `useId`. The connected mobile merge dialog is found by its correct name and passes the automated scan.
5. **High, action state: account change during asynchronous preparation.** Source `src/components/TransactionFlow.tsx:86`. Added a current account/chain guard when preparation resolves, in addition to invalidation and the immediate pre-wallet guard at `:208`. A stale preparation cannot become a valid review for a different owner. Account-change and empty-wallet browser checks pass.
6. **High, network switching: adding a chain need not switch it.** Source `src/chain/switchNetwork.ts:14` and `src/lib/useSepoliaSwitch.ts`. Extended tests exposed the SDK fallback's assumption that add-chain also switches. The helper now adds only after 4902, reads the resulting chain, explicitly requests a switch if needed, verifies eth_chainId and then synchronizes wagmi. A genuine rejection is never retried. Four boundary tests and the controlled browser add-then-switch path pass.
7. **Medium, disconnect: another authorized connection could remain current.** Source `src/components/Wallet.tsx:194`. The extended multi-provider harness left a second connection after a single-connector disconnect. The explicit Disconnect action now clears all current app connections sequentially. The final browser run returns to Connect wallet and no stale NFTs remain.
8. **Medium, layout: short desktop windows could hide sidebar utilities.** Source `src/styles.css:327`, `overflow-y: auto`. Added vertical sidebar scrolling while retaining the mobile in-flow navigation. Final production CSS includes the rule; responsive checks and the final probe pass.

The initial keyboard harness also assumed that native modal Tab could never reach browser chrome. Corrected the test to reject background app controls while respecting native browser focus behavior. Escape, restoration and all subsequent interaction checks pass. This was a test assertion correction, not a change that hides inaccessible application controls.

No reproduced high or medium issue remains open in the tested states. External capability limitations below remain explicit.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 0, 31 tests passed |
| `npm run build` | Exit 0; complete export generated after the final application source change |
| `npm run verify:chain` | Exit 0; `artifacts/deployment-verification.json` |
| `npx --no-install tsx scripts/check-live-reads.ts` | Exit 0 after fixing indexing; `artifacts/live-read-validation.json` |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers node scripts/check-browser.mjs /tmp/squeek-check/node_modules/playwright/index.mjs /tmp/squeek-check/node_modules/@axe-core/playwright/dist/index.mjs` | Final exit 0; 22 passed, 0 failed, WebKit not performed |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers IMD_PLAYWRIGHT=/tmp/squeek-check/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Final exit 0; 16/16 checks passed |
| `node scripts/check-budget.mjs` | Exit 0; final report in `artifacts/submission-budget.json` |

Final source/export checks also compare official JSON ABIs with the typed copies and hash every export file. `artifacts/abi-provenance.json` records all four exact matches. `artifacts/export-manifest.json` identifies the delivered files. Build warnings concern upstream annotations and chunk size only. No node_modules, package-manager caches, dependency tarballs, source maps or submodule is included.

## Live chain evidence and limits

Initial deployment verification used Ethereum block **12059509**, hash `0x6fac418f396e8c507c21cda8a47be1b2b93f8b6b808026ecc767131bf3a83058`, through the named public Sepolia endpoint. Core v3, Mining v6, both proxy admins, runtime hashes, layout digests, configuration and contract links match the pinned official deployment.

Live holder validation at block **12059586** discovered owned IDs **1–10**, checked genuine artwork, and simulated a ten-ID claim plus a merge of **#1 survivor / #2 donor**. The merge preview reads 2,000 combined current power, level 2 and 3,000 replacement power after activation. The SQK token contract address was independently read as a real zero-NFT address for the empty case. See JSON evidence for exact bigint rewards, fee estimates and block hashes. Browser preparations later repeated fresh deployment, owner and simulation checks against their own later snapshot blocks.

There were no signed or broadcast transactions. Synthetic fixtures verify event matching, revert handling and waiting for two confirmations; they are explicitly labeled and confined to tests. The controlled transaction provider received exactly one send request after explicit confirmation and rejected it; **broadcast count remains zero**. No receipt for that rejection was fabricated or recorded.

Coinbase passkey creation, real extension approval screens, physical phone deep-link handoff, Safari/WebKit, actual successful claim/merge inclusion, replacement inclusion and wallet-native gas presentation were not independently exercised. Public RPCs and the public indexer can be unavailable or lag; the UI fails honestly, offers retry/custom RPC and prevents actions when discovery or deployment verification is incomplete.

## Retained screenshots

- `screenshots/mobile-390.png`: first screen, product and main action, testnet label.
- `screenshots/desktop-1440.png`: sidebar, welcome, wallet control and collection layout.
- `screenshots/phone-wallet.png`: mobile app-browser options and Coinbase Smart Wallet.
- `screenshots/claim-review.png`: real simulated payout and sorted IDs before any wallet request.
- `screenshots/merge-review-mobile.png`: scrolled mobile confirmation after acknowledgement; full wrapped owner/contract, permanent burn warning and explicit merge button are visible. The title and result remain reachable by scrolling upward.

These are actual production screenshots. Scratch logs and additional captures remain outside the submission. All six design domains are reviewed; manual assistive technology, hardware, Safari and signed-chain checks are not implied by those screenshots.

## Completion

**Complete for the repository/static-export deliverable and the stated read-only/controlled-provider validation scope.** Public pin/URL assignment is left to the IMD publishing plane. Successful signed onchain execution and the unavailable browser/device checks are unverified, not claimed as passes. IMD Swarm job attribution is retained and Genesis approval is not claimed.
