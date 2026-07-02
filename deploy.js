#!/usr/bin/env node
/**
 * deploy.js — build the app and publish it as a static site (with index.html)
 * to a local folder.
 *
 * Usage:
 *   node deploy.js                                       # default output dir
 *   node deploy.js "D:\\Downloads\\Sample Publish"       # custom output dir
 *   node deploy.js --out="D:/Downloads/Sample Publish"   # or via flag
 *
 * Steps:
 *   1. `vite build` → produces dist/client (static assets) + dist/server (SSR bundle).
 *   2. Copy dist/client/** → <out>/.
 *   3. Import the SSR handler in-process and render each discovered route to
 *      <out>/<route>/index.html so the site works from any static host / IIS
 *      (URL Rewrite fallback still needed for deep-link refresh).
 *   4. Write a web.config with SPA-style rewrites for IIS.
 */

import { spawnSync } from "node:child_process";
import { mkdir, cp, writeFile, rm, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

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

function run(cmd, args) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: __dirname,
  });
  if (res.status !== 0) throw new Error(`${cmd} exited with code ${res.status}`);
}

function normalizeRoute(pathname) {
  if (!pathname) return "/";
  const [p] = pathname.split("#");
  const [clean] = p.split("?");
  if (!clean || clean === "/") return "/";
  return clean.replace(/\/+$/, "") || "/";
}

function extractLinks(html, origin) {
  const links = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], origin);
      if (u.origin !== origin) continue;
      if (u.pathname.startsWith("/api/")) continue;
      if (/\.[a-z0-9]+$/i.test(u.pathname)) continue;
      // Skip dynamic parameterized routes we can't statically render
      if (u.pathname.includes("$")) continue;
      links.add(normalizeRoute(u.pathname));
    } catch {}
  }
  return [...links];
}

async function discoverRoutesFromFs() {
  const routesDir = path.join(__dirname, "src", "routes");
  const routes = new Set(["/"]);
  if (!existsSync(routesDir)) return [...routes];
  const walk = async (dir, prefix = "") => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), `${prefix}/${entry.name}`);
        continue;
      }
      const name = entry.name.replace(/\.(tsx|ts|jsx|js)$/, "");
      if (!/\.(tsx|ts|jsx|js)$/.test(entry.name)) continue;
      if (name.startsWith("__") || name === "README") continue;
      if (name.startsWith("api.") || prefix.startsWith("/api")) continue;
      if (name.includes("$")) continue; // dynamic route, skip
      // Flat dot-based → path segments
      const segments = name
        .split(".")
        .filter((s) => s && s !== "index" && !s.startsWith("_"));
      const route = `/${[...prefix.split("/").filter(Boolean), ...segments].join("/")}`;
      routes.add(normalizeRoute(route));
    }
  };
  await walk(routesDir);
  return [...routes];
}

async function renderRoutes(handler, env, ctx, seedRoutes, outDir) {
  const origin = "http://localhost";
  const queue = [...new Set(seedRoutes)];
  const seen = new Set();
  const saved = [];
  while (queue.length) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);
    const url = origin + route;
    let res;
    try {
      res = await handler.fetch(new Request(url), env, ctx);
    } catch (err) {
      log(`  ! render failed for ${route}: ${err.message}`);
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
    log(`  ✓ ${route} → ${path.relative(outDir, file)}`);
    for (const link of extractLinks(html, origin)) {
      if (!seen.has(link)) queue.push(link);
    }
  }
  return saved;
}

const WEB_CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
  </system.webServer>
</configuration>
`;

async function main() {
  const { out } = parseArgs(process.argv);
  const outDir = path.resolve(out);
  log(`Publishing to: ${outDir}`);

  // 1. Build
  run(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build"]);
  const clientDir = path.join(__dirname, "dist", "client");
  const serverEntry = path.join(__dirname, "dist", "server", "index.mjs");
  if (!existsSync(clientDir)) throw new Error(`Missing build output: ${clientDir}`);
  if (!existsSync(serverEntry)) throw new Error(`Missing SSR entry: ${serverEntry}`);

  // 2. Prepare output dir
  if (existsSync(outDir)) {
    const s = await stat(outDir);
    if (!s.isDirectory()) throw new Error(`${outDir} exists and is not a directory`);
    for (const entry of await readdir(outDir)) {
      await rm(path.join(outDir, entry), { recursive: true, force: true });
    }
  } else {
    await mkdir(outDir, { recursive: true });
  }

  // 3. Copy static assets
  log(`Copying static assets → ${outDir}`);
  await cp(clientDir, outDir, { recursive: true });

  // 4. SSR-render HTML pages in-process
  log("Rendering pages via SSR bundle…");
  const mod = await import(pathToFileURL(serverEntry).href);
  const handler = mod.default || mod;
  const env = {
    ASSETS: { fetch: () => new Response("", { status: 404 }) },
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

  const seed = await discoverRoutesFromFs();
  log(`Seed routes: ${seed.join(", ")}`);
  const saved = await renderRoutes(handler, env, ctx, seed, outDir);
  log(`Saved ${saved.length} HTML page(s).`);

  // 5. web.config for IIS SPA fallback
  await writeFile(path.join(outDir, "web.config"), WEB_CONFIG, "utf8");
  log("Wrote web.config (IIS SPA fallback).");

  log(`Done. Open ${path.join(outDir, "index.html")}`);
}

main().catch((err) => {
  console.error(`\x1b[31m[deploy] Failed:\x1b[0m ${err.stack || err.message}`);
  process.exit(1);
});
