# SqueekOptimizer design

## Overview

SqueekOptimizer is an independent, non-custodial tool for Squeek NFT holders on Ethereum Sepolia. Its visual reference is [Squeekchain Genesis Code](https://squeekchain.com/genesis/code): pale lavender-gray backgrounds, warm orange dot artwork, condensed headings, rounded supporting type and precise monospace data. The original hamster illustration and identity distinguish the utility from the reference.

The main interaction is available on the first phone screen: the top-right wallet control and “Find my Squeeks.” A desktop sidebar provides persistent navigation. Hash routes keep every page compatible with static hosting. Empty or unavailable data stays unknown; artwork in the welcome panel is branding, never a wallet asset.

## Colors

Implemented in `src/styles.css`, primarily `:root`. The site intentionally uses one light theme matching the primary reference.

| Token | Value | Use |
| --- | --- | --- |
| `--color-page` | `#ededf1` | Application canvas |
| `--color-surface` | `#f9f9fb` | Sidebar, toolbar, cards and dialogs |
| `--color-raised` | `#ffffff` | Inputs and wallet rows |
| `--color-text` | `#242329` | Main text and primary button fill |
| `--color-muted` | `#686570` | Supporting text |
| `--color-border` | `#d9d7df` | Structured surfaces and dividers |
| `--color-hover` | `#e7e5ec` | Neutral hover surfaces |
| `--color-accent` | `#b85e2a` | Orange selections and artwork accents |
| `--color-accent-soft` | `#f3e4d6` | Selected navigation, orange icon grounds |
| `--color-accent-text` | `#84421f` | Links and selected text |
| `--color-purple` / `--color-purple-soft` | `#73509c` / `#eee7f5` | Claim identity and reward preview |
| `--color-success` / `--color-success-soft` | `#34725b` / `#e9f1eb` | Eligibility and confirmed results |
| `--color-danger` / `--color-danger-soft` | `#a63832` / `#faece8` | Burn confirmation and errors |
| `--color-warning` / `--color-warning-soft` | `#80551c` / `#faf0de` | Wrong chain and unavailable eligibility |
| `--color-focus` | `#6635a0` | Two-pixel keyboard focus ring |

The welcome background is `#f5e8d8` with a seven-pixel dot pattern. Its headline accent is `#99582d`, supporting text `#6a5545`. The Testnet badge uses `#6e537f` on `#e8e1ef`. A restrained cream-to-lavender gradient is confined to the sidebar custody note; gradients do not style text. Status always includes words or an icon.

Measured source pairs include muted/surface 5.42:1, text/page 13.35:1, welcome accent/base 4.60:1, welcome body/base 5.81:1, Testnet badge 5.13:1 and burn-warning text/background 6.36:1. The design probe measures resolved solid backgrounds; see validation for its exclusions. No complete WCAG conformance claim is made.

## Typography

All fonts are local in `public/assets/`, copied into `dist/assets/` at build time. There are no Google Fonts requests at runtime.

- Quicksand: body and navigation; weights 400, 600 and 700.
- Barlow Condensed: headings, large amounts and power values; weight 600.
- IBM Plex Mono: addresses, transaction details and short button labels; weight 400.

The six semantic sizes are caption 12px, small 14px, body 16px, title 20px, large 28px and display 48px. At 580px and below, display becomes 36px. Numeric values use tabular digits. Body line height is 1.6; headings use 1.15. Headings balance their wrapping, supporting copy uses pretty wrapping and long IDs wrap rather than truncate. Mobile text inputs use 16px to avoid iOS input zoom. Explicit strong weight 700 prevents the browser's relative `bolder` rule from introducing a fourth weight.

## Spacing and layout

The desktop sidebar is 232px wide, narrowing to 210px at 1200px and 190px at 990px. It scrolls vertically on short windows. The header is at least 88px high. Main content is capped at 1400px with 40px side padding, reduced progressively to 18px on phones and 14px below 360px. Repeated component spacing uses 8, 12, 16, 20, 24 and 32px steps; controls keep their specific optical padding.

Four summary metrics share one structural surface. The collection toolbar sits directly above the NFTs it changes. NFT cards use four columns on wide desktop, three on intermediate widths and two on phones. At 760px and below, the sidebar becomes a horizontal navigation row below the header. It remains in document flow and never covers page content. The phone header is at least 76px high.

The merge builder and eligibility explanation sit side by side on wide screens and stack below 990px. Claim totals and the action stack below 580px. At 390px, the welcome headline and main action remain above the fold; the mascot is decorative and cannot intercept pointer events.

## Components

- `PageHeading` and `Welcome` in `src/components/Pages.tsx`: task heading, Testnet badge and short contextual welcome with the product's dot hamster.
- `ConnectButton` and `WalletProvider` in `src/components/Wallet.tsx`: one persistent top-right wallet control, discovered EIP-6963 wallets, account details, disconnect and explicit network switching. Mobile links open the current page in a wallet app. Coinbase uses its own bundled mark.
- `Modal` in `src/components/Modal.tsx`: native modal dialog with unique accessible title, native focus trapping/restoration, Escape/backdrop dismissal and body scroll containment. Its desktop maximum width is 430px, or 590px for transactions. Below 580px it becomes a bottom sheet with safe-area padding and scrollable content.
- `NftCard` in `src/components/NftCard.tsx`: real onchain artwork in an image element, ID, level, active/pending power, claimable SQK and eligibility reason. The full-card illustration is not a navigation trap; the checkbox and explorer link are separate controls. Selection is capped at 32.
- `Gallery`: filter buttons with pressed states, labeled token-ID search and native sort select. Loading, unavailable, disconnected, empty and no-match states are separate.
- `MergePage`: survivor and donor selects, swap action, eligible groups and before/after power. Ineligible selections explain their problems before simulation.
- `TransactionFlow`: exact payout, account, network, contract, IDs, buffered gas limit, capped fee, snapshot, wallet request, receipt status and full transaction hash. A merge additionally requires a burn acknowledgement checkbox and a red explicit confirmation.

Controls use 6px radii, cards 9px, welcome 10px, desktop dialogs 12px and phone sheets 16px at the upper corners. Structural surfaces use borders; modal elevation uses a shadow without a border. Cards do not nest inside cards. Focus, hover, active, disabled and loading states are implemented. Errors persist until resolved or dismissed.

## Motion and accessibility

Transitions name only background, border, color and transform, last 150ms and use ease-out or `cubic-bezier(.2,0,0,1)`. Press feedback scales buttons to 0.96. Loading icons rotate only when reduced motion is not requested; labels communicate loading independently. There is no entrance animation or autoplay.

Native links, buttons, selects, checkboxes and dialog elements carry keyboard behavior. The app includes a skip link, visible focus rings, semantic navigation, labeled fields, descriptive image alternatives and live error/status messages. Hash navigation moves focus to the main region. Address shortening is confined to the wallet trigger; the account dialog and transaction previews expose full values. Forced-colors rules retain focus and selected-checkbox visibility.

Chromium screenshots and automated accessibility checks cover representative mobile/desktop states. Safari/WebKit, physical-device interaction, native 200% browser zoom, an actual screen-reader session and real wallet passkey/extension prompts remain unverified. These limits are recorded in `artifacts/validation.md`.

## Attribution

Built through IMD Swarm, job `ceb48beb-6fb5-4aaa-929a-fba9804755a8`. No Genesis approval is claimed. Better Interface principles are adapted from Jakub Krehel's MIT-licensed guide at commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation structure is adapted from Paul Bakaus's Apache-2.0 Impeccable reference at commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Required notices and font/wallet-mark licenses are under `artifacts/licenses/`.
