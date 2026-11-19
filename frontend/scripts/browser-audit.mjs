// Browser audit (Phase 8, T073): drives a real headless Edge or Chrome against the running dev servers and checks, at phone,
// tablet and desktop widths, that (1) axe-core finds no WCAG 2 A/AA violations (including real colour contrast),
// (2) nothing scrolls sideways, and (3) every control can be reached with the keyboard.
//
//   Needs: backend on 127.0.0.1:4000, frontend on 127.0.0.1:5173, and SMOKE_PW (a run-time password for a throw-away member).
//   Usage:  SMOKE_PW=... node scripts/browser-audit.mjs   (set BROWSER to the browser executable if it is not found)
//   The throw-away member is created through the API and removed by the caller (see the printed email).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = "http://127.0.0.1:5173";
const PW = process.env.SMOKE_PW;
if (!PW) throw new Error("Set SMOKE_PW to a run-time password (never write it to a file).");

const CANDIDATES = [
  process.env.BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browserPath = CANDIDATES.find((p) => existsSync(p));
if (!browserPath) throw new Error("No Edge or Chrome found. Set BROWSER.");

const SIZES = [
  { name: "phone", width: 375, height: 800, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1280, height: 900, mobile: false },
];

const api = async (method, p, body, cookie) => {
  const res = await fetch(`${BASE}/api${p}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null), cookie: set.map((c) => c.split(";")[0]).join("; ") };
};

async function prepareMember() {
  const tag = Date.now().toString().slice(-6);
  const email = `audit8${tag}@example.com`;
  await api("POST", "/members/register", { name: "Audit Reader", email, mobile: `9893${tag}`, password: PW, confirmPassword: PW });
  const login = await api("POST", "/members/login", { identifier: email, password: PW });
  if (login.status !== 200) throw new Error("Could not sign in the audit member");
  const cookie = login.cookie;
  const books = (await api("GET", "/books?pageSize=4")).data.items;
  for (const b of books.slice(0, 3)) await api("POST", "/wishlist/items", { bookId: b.id }, cookie);
  await api("POST", "/cart/items", { bookId: books[0].id, quantity: 2 }, cookie);
  await api("POST", `/writers/${books[0].authors[0].id}/follow`, undefined, cookie);
  await api("POST", "/addresses", { recipient: "Audit", phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pinCode: "411001" }, cookie);
  return { email, cookie, book: books[0], author: books[0].authors[0] };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluation failed");
    return r.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const dir = mkdtempSync(path.join(tmpdir(), "bw-audit-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(browserPath, [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${dir}`, "--headless=new", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 60; i += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve);
          ws.addEventListener("error", reject);
        });
        return { cdp: new Cdp(ws), child, dir };
      }
    } catch {
      // not ready yet
    }
    await sleep(250);
  }
  child.kill();
  throw new Error("Browser did not start");
}

async function main() {
  const who = await prepareMember();
  const { cdp, child, dir } = await launch();
  const shots = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  const results = [];
  try {
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
    const session = who.cookie.split("=");
    await cdp.send("Network.setCookie", { name: session[0], value: session.slice(1).join("="), url: BASE });

    const pages = [
      { name: "home", url: "/" },
      { name: "catalogue", url: "/books?category=mystery" },
      { name: "book", url: `/books/${who.book.id}` },
      { name: "cart", url: "/cart" },
      { name: "checkout", url: "/checkout" },
      { name: "orders", url: "/orders" },
      { name: "wishlist", url: "/wishlist" },
      { name: "writers", url: "/writers" },
      { name: "writer", url: `/writers/${who.author.id}` },
    ];

    for (const size of SIZES) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      for (const p of pages) {
        await cdp.send("Page.navigate", { url: BASE + p.url });
        await sleep(1800);
        await cdp.eval(AXE);
        const axe = await cdp.eval(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0,3).map(n => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.failureSummary ?? '').slice(0,140)) })))`);
        const overflow = await cdp.eval(`(() => { const d = document.documentElement; return { client: d.clientWidth, scroll: d.scrollWidth }; })()`);
        // Keyboard: every interactive element must be focusable (not tabindex -1) unless it is hidden or disabled.
        const stuck = await cdp.eval(`(() => [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button]')].filter(e => !e.disabled && e.offsetParent !== null && e.tabIndex < 0 && e.getAttribute('aria-hidden') !== 'true').map(e => e.outerHTML.slice(0,80)))()`);
        const title = await cdp.eval("document.title");
        results.push({ size: size.name, page: p.name, violations: axe, overflow: overflow.scroll > overflow.client + 1 ? overflow : null, stuck, title });
        if (shots) {
          const s = await cdp.send("Page.captureScreenshot", { format: "png" });
          writeFileSync(path.join(shots, `${size.name}-${p.name}.png`), Buffer.from(s.data, "base64"));
        }
      }
    }

    // Sign-in and sign-up dialogs (as a guest).
    await cdp.send("Network.clearBrowserCookies");
    for (const size of SIZES) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      for (const dialog of ["login", "register"]) {
        await cdp.send("Page.navigate", { url: BASE + "/" });
        await sleep(1500);
        await cdp.eval(`(() => { const b = document.querySelector('header button.bg-indigo-600'); b.focus(); b.click(); })()`);
        await sleep(300);
        if (dialog === "register") {
          await cdp.eval(`[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Sign Up').click()`);
          await sleep(300);
        }
        await cdp.eval(AXE);
        const axe = await cdp.eval(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0,3).map(n => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? n.failureSummary ?? '').slice(0,140)) })))`);
        const overflow = await cdp.eval(`(() => { const d = document.documentElement; return { client: d.clientWidth, scroll: d.scrollWidth }; })()`);
        // Keyboard, with real key presses: Tab and Shift+Tab must stay inside the dialog, and Escape must close it
        // and give focus back to the control that opened it.
        const key = (k, shift = false) => cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: k, windowsVirtualKeyCode: k === "Tab" ? 9 : 27, modifiers: shift ? 8 : 0 }).then(() => cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: k === "Tab" ? 9 : 27, modifiers: shift ? 8 : 0 }));
        const inside = () => cdp.eval(`!!document.activeElement && !!document.activeElement.closest('[role=dialog]')`);
        const tabbed = [await inside()];
        for (let i = 0; i < 14; i += 1) { await key("Tab"); tabbed.push(await inside()); }
        for (let i = 0; i < 4; i += 1) { await key("Tab", true); tabbed.push(await inside()); }
        await key("Escape");
        await sleep(300);
        const closed = await cdp.eval(`!document.querySelector('[role=dialog]')`);
        const refocused = await cdp.eval(`document.activeElement === document.querySelector('header button.bg-indigo-600')`);        results.push({ size: size.name, page: `${dialog} dialog`, violations: axe, overflow: overflow.scroll > overflow.client + 1 ? overflow : null, stuck: [], title: await cdp.eval("document.title"), tabbed, closed, refocused });
        if (shots) writeFileSync(path.join(shots, `${size.name}-${dialog}.png`), Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      }
    }
  } finally {
    child.kill();
    await sleep(500);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // the browser may still hold a file; the OS temp folder is cleaned up later
    }
  }

  let bad = 0;
  for (const r of results) {
    const issues = [];
    for (const v of r.violations) issues.push(`axe ${v.id} (${v.impact}): ${v.help}\n      ${v.nodes.join("\n      ")}`);
    if (r.overflow) issues.push(`sideways scroll: content ${r.overflow.scroll}px in a ${r.overflow.client}px window`);
    if (r.stuck.length) issues.push(`not keyboard reachable: ${r.stuck.join(" | ")}`);
    if (r.tabbed && r.tabbed.includes(false)) issues.push("focus can leave the open dialog with Tab or Shift+Tab");
    if (r.tabbed && !r.closed) issues.push("Escape does not close the dialog");
    if (r.tabbed && r.closed && !r.refocused) issues.push("focus is not returned to the Login button after the dialog closes");
    bad += issues.length;
    console.log(`${issues.length ? "FAIL" : "PASS"}  ${r.size.padEnd(7)} ${r.page.padEnd(16)} title="${r.title}"${issues.length ? "\n    " + issues.join("\n    ") : ""}`);
  }
  console.log(`\n${results.length} checks, ${bad} issue(s). Audit member: ${who.email}`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(2);
});
