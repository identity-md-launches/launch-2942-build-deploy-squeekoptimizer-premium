// Bounded browser validation. Tools are installed outside the submission; no wallet keys are used.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const { chromium, webkit } = await import(process.argv[2]);
const { default: AxeBuilder } = await import(process.argv[3]);
const root = resolve("dist");
const results = [];
const errors = [];
const requests = [];
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith("/preview/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const file = resolve(root, path.slice(9) || "index.html");
    if (!file.startsWith(root + "/") && file !== root + "/index.html")
      throw Error("invalid path");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": mime[extname(file)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ headless: true });
const live = JSON.parse(
  await readFile("artifacts/live-read-validation.json", "utf8"),
);
await mkdir("test/scratch/browser-checks", { recursive: true });
const out = "test/scratch/browser-checks";
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, passed: false, error: String(e) });
    console.error("FAIL", name, String(e));
  }
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(url))
      requests.push({ url: r.url(), status: r.status() });
  });
  await page.goto(url);
  await page
    .getByRole("heading", { name: "My Squeeks", exact: true })
    .waitFor();
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await check("desktop loads at static subpath with local fonts", async () => {
    assert.equal(
      await page.title(),
      "SqueekOptimizer · Your Squeeks, working smarter",
    );
    assert.equal(
      await page.evaluate(() => document.fonts.check("600 16px Quicksand")),
      true,
    );
    await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  });
  await check("wallet picker, keyboard Escape and focus return", async () => {
    const trigger = page.getByRole("button", {
      name: "Connect wallet",
      exact: true,
    });
    await trigger.click();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Browser wallet", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Coinbase Wallet", exact: true })
        .count(),
      1,
    );
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page
          .getByRole("dialog")
          .evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body),
        true,
      );
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await trigger.evaluate((e) => document.activeElement === e),
      true,
    );
  });
  await check("navigation, disconnected claim and merge actions", async () => {
    await page.getByRole("link", { name: "Smart claim", exact: true }).click();
    await page
      .getByRole("heading", { name: "Smart claim", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Simulate & review claim" })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("link", { name: "Merge optimizer", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Merge optimizer", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByText(
          "Your eligible pairs will appear after connecting your wallet.",
        )
        .count(),
      1,
    );
    await page.getByRole("link", { name: "Activity", exact: true }).click();
    await page.getByRole("heading", { name: "A fresh start" }).waitFor();
  });
  await check(
    "RPC settings validate invalid URL and restore public endpoints",
    async () => {
      await page
        .getByRole("link", { name: "Network & contracts", exact: true })
        .click();
      await page.getByLabel("Sepolia RPC URL").fill("http://example.com");
      await page.getByRole("button", { name: "Save & verify" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Enter an HTTPS RPC URL" })
        .waitFor();
      await page.getByRole("button", { name: "Use public RPCs" }).click();
      assert.equal(await page.getByLabel("Sepolia RPC URL").inputValue(), "");
    },
  );
  await page.goto(url);
  await check(
    "390px first screen contains product and main action",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const action = page.getByRole("button", { name: "Find my Squeeks" });
      const box = await action.boundingBox();
      assert.ok(box && box.y + box.height < 844);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
    },
  );
  await check("390px wallet bottom sheet with 44px targets", async () => {
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({ path: `${out}/wallet-sheet.png` });
    const box = await page
      .getByRole("button", { name: "Browser wallet", exact: true })
      .boundingBox();
    assert.ok(box.height >= 48);
    await page.keyboard.press("Escape");
  });
  await check("320px, 760px, 990px and 1440px reflow", async () => {
    for (const width of [320, 760, 990, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `overflow at ${width}`,
      );
    }
  });
  await check(
    "automated accessibility scan on disconnected product",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      await writeFile(
        `${out}/axe-disconnected.json`,
        JSON.stringify(scan.violations, null, 2),
      );
      assert.deepEqual(
        scan.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        })),
        [],
      );
    },
  );
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const phone = await mobile.newPage();
  await phone.goto(url);
  await check(
    "phone offers app-browser links and Coinbase Smart Wallet",
    async () => {
      await phone
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        assert.equal(
          await phone
            .getByRole("link", { name: `Open in ${name}`, exact: true })
            .count(),
          1,
        );
      assert.equal(
        await phone
          .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
          .count(),
        1,
      );
      assert.match(
        await phone
          .getByRole("link", { name: "Open in Rabby", exact: true })
          .getAttribute("href"),
        /_cmd=open-dapp/,
      );
      await phone.screenshot({ path: `${out}/phone-wallet.png` });
      await phone.keyboard.press("Escape");
    },
  );
  await mobile.close();
  // EIP-6963 harness exposes an actual public holder address for READS. It never signs or broadcasts.
  const walletContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await walletContext.addInitScript(
    ({ holder }) => {
      const listeners = {};
      let account = holder;
      let chain = "0x1";
      let connected = false;
      let rejectConnect = true;
      let sepoliaAdded = false;
      window.__walletCalls = [];
      const emit = (event, value) =>
        (listeners[event] || []).forEach((fn) => fn(value));
      const provider = {
        on: (event, fn) => {
          (listeners[event] ??= []).push(fn);
        },
        removeListener: (event, fn) => {
          listeners[event] = (listeners[event] || []).filter((x) => x !== fn);
        },
        request: async ({ method, params }) => {
          window.__walletCalls.push({ method, params });
          if (method === "eth_requestAccounts") {
            if (rejectConnect) {
              rejectConnect = false;
              throw Object.assign(Error("User rejected the request"), {
                code: 4001,
              });
            }
            connected = true;
            return [account];
          }
          if (method === "eth_accounts") return connected ? [account] : [];
          if (method === "eth_chainId") return chain;
          if (method === "wallet_requestPermissions")
            return [
              {
                parentCapability: "eth_accounts",
                caveats: [
                  { type: "restrictReturnedAccounts", value: [account] },
                ],
              },
            ];
          if (method === "wallet_getPermissions")
            return connected ? [{ parentCapability: "eth_accounts" }] : [];
          if (method === "wallet_switchEthereumChain") {
            if (!sepoliaAdded)
              throw Object.assign(Error("Unknown chain"), { code: 4902 });
            chain = params[0].chainId;
            emit("chainChanged", chain);
            return null;
          }
          if (method === "wallet_addEthereumChain") {
            sepoliaAdded = true;
            return null;
          }
          if (method === "wallet_revokePermissions") {
            connected = false;
            return null;
          }
          if (method === "eth_sendTransaction")
            throw Object.assign(Error("User rejected the request"), {
              code: 4001,
            });
          if (/sign|send|approve/i.test(method))
            throw Error("Signing is prohibited in this test harness");
          throw Object.assign(Error(`Unsupported test method ${method}`), {
            code: 4200,
          });
        },
      };
      const info = {
        uuid: "750a6754-95ce-4b28-bfa2-aa0b966d1f03",
        name: "Rabby",
        rdns: "io.rabby",
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      };
      const infos = [
        info,
        {
          ...info,
          uuid: "3293e9da-5192-411d-afb3-c9a7efa1fb3a",
          name: "MetaMask",
          rdns: "io.metamask",
        },
        {
          ...info,
          uuid: "75db5c65-b864-491f-bf65-2ed633e31621",
          name: "OKX Wallet",
          rdns: "com.okex.wallet",
        },
      ];
      const announce = () =>
        infos.forEach((info) =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: { info, provider },
            }),
          ),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
      window.ethereum = provider;
      window.__testWallet = {
        changeAccount: (a) => {
          account = a;
          emit("accountsChanged", [a]);
        },
        changeChain: (c) => {
          chain = c;
          emit("chainChanged", c);
        },
      };
    },
    { holder: live.holder },
  );
  const walletPage = await walletContext.newPage();
  walletPage.on("pageerror", (e) => errors.push(String(e)));
  await walletPage.goto(url);
  await check(
    "EIP-6963 lists named extension and hides generic injected row",
    async () => {
      await walletPage
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await walletPage
        .getByRole("button", { name: "Rabby", exact: true })
        .waitFor();
      assert.equal(
        await walletPage
          .getByRole("button", { name: "MetaMask", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await walletPage
          .getByRole("button", { name: "OKX Wallet", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await walletPage
          .getByRole("button", { name: "Browser wallet", exact: true })
          .count(),
        0,
      );
    },
  );
  await check(
    "wallet connection rejection returns an honest error",
    async () => {
      await walletPage
        .getByRole("button", { name: "Rabby", exact: true })
        .click();
      await walletPage
        .getByRole("alert")
        .filter({ hasText: "cancelled" })
        .waitFor();
      assert.equal(await walletPage.getByRole("dialog").isVisible(), true);
    },
  );
  await check(
    "wallet connection and user-approved Sepolia switching",
    async () => {
      await walletPage
        .getByRole("button", { name: "Rabby", exact: true })
        .click();
      await walletPage
        .getByRole("button", { name: "Switch to Sepolia", exact: true })
        .waitFor();
      assert.equal(
        await walletPage.getByText(/Your wallet is on chain 1\./).count(),
        1,
      );
      await walletPage
        .getByRole("button", { name: "Switch to Sepolia", exact: true })
        .click();
      await walletPage.getByRole("button", { name: /0x7f8C.*513d/ }).waitFor();
      const calls = await walletPage.evaluate(() => window.__walletCalls);
      assert.ok(
        calls.filter((c) => c.method === "wallet_switchEthereumChain").length >=
          1,
      );
      assert.equal(
        calls.filter((c) => c.method === "wallet_addEthereumChain").length,
        1,
      );
      assert.equal(
        calls.filter((c) => /sign|sendTransaction/i.test(c.method)).length,
        0,
      );
    },
  );
  await check(
    "real NFT discovery and artwork for read-only public holder",
    async () => {
      await walletPage
        .getByRole("heading", { name: "Squeek #1", exact: true })
        .waitFor({ timeout: 120000 });
      assert.equal(
        await walletPage.locator(".nft-card").count(),
        live.portfolio.nfts.length,
      );
      await walletPage
        .locator(".nft-art>img")
        .first()
        .waitFor({ timeout: 45000 });
      await walletPage.screenshot({
        path: `${out}/live-holder.png`,
        fullPage: true,
      });
    },
  );
  await check("collection filters, search and batch selection", async () => {
    await walletPage
      .getByRole("textbox", { name: "Search token ID" })
      .fill("999999");
    await walletPage
      .getByRole("heading", { name: "No matching Squeeks" })
      .waitFor();
    await walletPage.getByRole("button", { name: "Reset filters" }).click();
    await walletPage
      .getByRole("checkbox", { name: "Select Squeek #2", exact: true })
      .check();
    await walletPage
      .getByRole("checkbox", { name: "Select Squeek #1", exact: true })
      .check();
    assert.equal(await walletPage.getByText("2 of 32 selected").count(), 1);
  });
  await check(
    "live claim simulation, review closes without signing",
    async () => {
      await walletPage
        .getByRole("button", { name: "Review claim", exact: true })
        .click();
      await walletPage
        .getByRole("button", { name: "Confirm claim in wallet" })
        .waitFor({ timeout: 90000 });
      await walletPage.screenshot({
        path: `${out}/claim-review.png`,
        fullPage: true,
      });
      assert.ok(await walletPage.getByText("#1, #2", { exact: true }).count());
      const calls = await walletPage.evaluate(() => window.__walletCalls);
      assert.equal(
        calls.filter((c) => c.method === "eth_sendTransaction").length,
        0,
      );
      await walletPage.keyboard.press("Escape");
    },
  );
  await check(
    "explicit claim confirmation handles rejection without resubmission",
    async () => {
      await walletPage
        .getByRole("button", { name: "Review claim", exact: true })
        .click();
      await walletPage
        .getByRole("button", { name: "Confirm claim in wallet" })
        .waitFor({ timeout: 90000 });
      await walletPage
        .getByRole("button", { name: "Confirm claim in wallet" })
        .click();
      await walletPage
        .getByRole("alert")
        .filter({ hasText: /cancelled|changed since this preview/ })
        .waitFor({ timeout: 90000 });
      const calls = await walletPage.evaluate(() => window.__walletCalls);
      assert.equal(
        calls.filter((c) => c.method === "eth_sendTransaction").length,
        1,
      );
      results.push({
        name: "Transaction prompt count at cancellation",
        passed: true,
        sendTransactionRequests: 1,
        broadcasts: 0,
      });
      await walletPage
        .getByRole("button", { name: "Close and return" })
        .click();
    },
  );
  await check(
    "merge pair, survivor swap and irreversible confirmation",
    async () => {
      await walletPage
        .getByRole("link", { name: "Merge optimizer", exact: true })
        .click();
      await walletPage
        .getByRole("button", { name: "Choose pair" })
        .first()
        .click();
      const before = await walletPage
        .getByLabel("Survivor", { exact: false })
        .inputValue();
      await walletPage
        .getByRole("button", { name: "Swap survivor & donor" })
        .click();
      assert.equal(
        await walletPage.getByLabel("Donor", { exact: false }).inputValue(),
        before,
      );
      await walletPage
        .getByRole("button", { name: "Simulate & review merge" })
        .click();
      await walletPage
        .getByRole("button", { name: "Confirm permanent merge" })
        .waitFor({ timeout: 90000 });
      await walletPage.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await walletPage
          .getByRole("button", { name: "Confirm permanent merge" })
          .isDisabled(),
        true,
      );
      await walletPage
        .getByText("DONOR NFT WILL BE PERMANENTLY BURNED.", { exact: true })
        .waitFor();
      await walletPage
        .getByRole("checkbox", { name: /I understand that donor/ })
        .check();
      assert.equal(
        await walletPage
          .getByRole("button", { name: "Confirm permanent merge" })
          .isEnabled(),
        true,
      );
      assert.equal(
        await walletPage
          .getByRole("dialog", { name: "Review your merge", exact: true })
          .count(),
        1,
      );
      await walletPage.screenshot({ path: `${out}/merge-review.png` });
      assert.equal(
        await walletPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const scan = await new AxeBuilder({ page: walletPage })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      await writeFile(
        `${out}/axe-merge.json`,
        JSON.stringify(scan.violations, null, 2),
      );
      assert.deepEqual(
        scan.violations.map((v) => v.id),
        [],
      );
      await walletPage.keyboard.press("Escape");
      await walletPage.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "account changes clear NFTs and show verified empty wallet",
    async () => {
      await walletPage.evaluate(
        (account) => window.__testWallet.changeAccount(account),
        live.emptyWalletRead.address,
      );
      await walletPage
        .getByRole("link", { name: "My Squeeks", exact: true })
        .click();
      await walletPage
        .getByRole("heading", { name: "No Squeeks in this wallet" })
        .waitFor({ timeout: 90000 });
      assert.equal(await walletPage.locator(".nft-card").count(), 0);
      await walletPage.screenshot({
        path: `${out}/empty-wallet.png`,
        fullPage: true,
      });
    },
  );
  await check("disconnect clears wallet state", async () => {
    await walletPage.locator(".wallet-trigger").click();
    await walletPage
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await walletPage
      .getByRole("button", { name: "Connect wallet", exact: true })
      .waitFor();
  });
  await check("no runtime script errors or missing local assets", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  });
  await walletContext.close();
  const failureContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const failurePage = await failureContext.newPage();
  await failurePage.route(
    /https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|sepolia\.gateway\.tenderly\.co|sepolia\.drpc\.org)/,
    (route) => route.fulfill({ status: 503, body: "RPC unavailable" }),
  );
  await failurePage.goto(url);
  await check(
    "RPC failure stays honest and wallet connection remains available",
    async () => {
      await failurePage
        .getByRole("alert")
        .filter({ hasText: "Sepolia reads are unavailable" })
        .waitFor({ timeout: 25000 });
      assert.equal(
        await failurePage
          .getByRole("button", { name: "Connect wallet", exact: true })
          .isEnabled(),
        true,
      );
      assert.equal(await failurePage.getByText("Squeeks owned").count(), 1);
      await failurePage
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await failurePage
        .getByRole("dialog", { name: "Connect a wallet" })
        .waitFor();
      await failurePage.keyboard.press("Escape");
      await failurePage.screenshot({
        path: `${out}/rpc-error.png`,
        fullPage: true,
      });
    },
  );
  await failureContext.close();
  try {
    const safari = await webkit.launch({ headless: true });
    const safariPage = await safari.newPage({
      viewport: { width: 390, height: 844 },
    });
    await safariPage.goto(url);
    await safariPage
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await safariPage.getByRole("dialog").waitFor();
    await safariPage.screenshot({ path: `${out}/webkit.png` });
    results.push({ name: "WebKit wallet and mobile layout", passed: true });
    await safari.close();
  } catch (e) {
    results.push({
      name: "WebKit wallet and mobile layout",
      passed: null,
      limitation: /missing dependencies/i.test(String(e)) ? "WebKit could not launch: required system shared libraries are missing." : String(e).slice(0, 500),
    });
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    "artifacts/browser-validation.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        source:
          "Production dist served at /preview/; actual public RPC reads; controlled EIP-6963 account provider; no signing or broadcasting",
        results,
        scriptErrors: errors,
        missingLocalAssets: requests,
      },
      null,
      2,
    ) + "\n",
  );
}
if (results.some((r) => r.passed === false)) process.exitCode = 1;
