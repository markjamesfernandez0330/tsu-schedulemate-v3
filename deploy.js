#!/usr/bin/env node
/**
 * deploy.js — build the app and publish it as a static site (with index.html)
 * to a local folder.
 *
 * Usage:
 *   node deploy.js                                       # uses default output dir
 *   node deploy.js "D:\\Downloads\\Sample Publish"       # custom output dir
 *   node deploy.js --out="D:/Downloads/Sample Publish"   # or via flag
 *
 * What it does:
 *   1. Runs `vite build` to produce dist/client (static assets) + a server bundle.
 *   2. Boots `vite preview` locally on a free port.
 *   3. Crawls the app starting from "/" and saves each rendered page as
 *      <out>/<route>/index.html so the site works from any static host
 *      (including opening index.html directly, when routes are visited via
 *      real folder paths).
 *   4. Copies every static asset from dist/client into <out>.
 *   5. Shuts the preview server down.
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, cp, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = "D:\\Downloads\\Sample Publish";

function parseArgs(argv) {
  let out = DEFAULT_OUT;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
    else if (!arg.startsWith("--")) out = arg;
  }
  return { out };
}

function log(msg) {
  console.log(`\x1b[36m[deploy]\x1b[0m ${msg}`);
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: __dirname,
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} exited with code ${res.status}`);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startPreview(port) {
  log(`Starting vite preview on port ${port}…`);
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "preview", "--port", String(port), "--strictPort"],
    { cwd: __dirname, stdio: ["ignore", "pipe", "pipe"], shell: false },
  );
  child.stdout.on("data", (b) => process.stdout.write(`\x1b[90m${b}\x1b[0m`));
  child.stderr.on("data", (b) => process.stderr.write(`\x1b[90m${b}\x1b[0m`));
  return child;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not respond at ${url}`);
}

function normalizeRoute(pathname) {
  if (!pathname) return "/";
  const [p] = pathname.split("#");
  const [clean] = p.split("?");
  if (!clean || clean === "/") return "/";
  // strip trailing slash except for root
  return clean.replace(/\/+$/, "") || "/";
}

function extractLinks(html, base) {
  const links = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    try {
      const u = new URL(href, base);
      if (u.origin !== new URL(base).origin) continue;
      if (u.pathname.startsWith("/api/")) continue;
      // Skip file-ish links (they'll be copied from dist/client)
      if (/\.[a-z0-9]+$/i.test(u.pathname)) continue;
      links.add(normalizeRoute(u.pathname));
    } catch {}
  }
  return [...links];
}

async function crawl(baseUrl, outDir) {
  const queue = ["/"];
  const seen = new Set();
  const saved = [];
  while (queue.length) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);
    const url = new URL(route, baseUrl).toString();
    let res;
    try {
      res = await fetch(url, { redirect: "follow" });
    } catch (err) {
      log(`  ! fetch failed for ${route}: ${err.message}`);
      continue;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) continue;
    const html = await res.text();
    const targetDir =
      route === "/" ? outDir : path.join(outDir, ...route.split("/").filter(Boolean));
    await mkdir(targetDir, { recursive: true });
    const file = path.join(targetDir, "index.html");
    await writeFile(file, html, "utf8");
    saved.push(route);
    log(`  ✓ ${route} → ${path.relative(outDir, file) || "index.html"}`);
    for (const link of extractLinks(html, baseUrl)) {
      if (!seen.has(link)) queue.push(link);
    }
  }
  return saved;
}

async function main() {
  const { out } = parseArgs(process.argv);
  const outDir = path.resolve(out);

  log(`Publishing to: ${outDir}`);

  // 1. Build (use npx so it works whether the user has bun or only node installed)
  run(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build"]);
  const clientDir = path.join(__dirname, ".output", "public");
  if (!existsSync(clientDir)) {
    throw new Error(`Expected build output at ${clientDir}`);
  }

  // 2. Prepare output dir
  if (existsSync(outDir)) {
    const s = await stat(outDir);
    if (!s.isDirectory()) throw new Error(`${outDir} exists and is not a directory`);
    // wipe contents but keep the folder
    for (const entry of await (await import("node:fs/promises")).readdir(outDir)) {
      await rm(path.join(outDir, entry), { recursive: true, force: true });
    }
  } else {
    await mkdir(outDir, { recursive: true });
  }

  // 3. Copy static assets
  log(`Copying static assets from dist/client → ${outDir}`);
  await cp(clientDir, outDir, { recursive: true });

  // 4. Boot preview + crawl to render HTML pages
  const port = await getFreePort();
  const preview = startPreview(port);
  const baseUrl = `http://localhost:${port}`;
  try {
    await waitForServer(baseUrl);
    log("Crawling routes…");
    const saved = await crawl(baseUrl, outDir);
    log(`Saved ${saved.length} HTML page(s).`);
  } finally {
    preview.kill();
  }

  log(`Done. Open ${path.join(outDir, "index.html")} to view your site.`);
}

main().catch((err) => {
  console.error(`\x1b[31m[deploy] Failed:\x1b[0m ${err.stack || err.message}`);
  process.exit(1);
});
