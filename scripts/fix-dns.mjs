#!/usr/bin/env node
/**
 * Replace Worker-type DNS record with standard proxied A record for song.opsec.rent.
 * Run after `wrangler deploy` with zone route config.
 *
 * Usage: node scripts/fix-dns.mjs
 * Requires CLOUDFLARE_API_TOKEN (Zone.DNS.Edit) or a fresh `npx wrangler login`.
 * Note: Wrangler OAuth scopes include zone:read only — DNS mutations need an API token.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ACCOUNT = "865dded96630ca6a533584a80efad356";
const ZONE_ID = "1366ca1f4d9f61f42895693748650612";

function loadToken() {
  const wrangler = join(process.cwd(), "node_modules", ".bin", "wrangler");
  try {
    // Refresh OAuth session before reading token
    execFileSync(wrangler, ["whoami"], {
      encoding: "utf8",
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    const out = execFileSync(wrangler, ["auth", "token", "--json"], {
      encoding: "utf8",
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(out.trim());
    if (!parsed.token) throw new Error("No token in wrangler auth output");
    return parsed.token;
  } catch (err) {
    if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
    throw new Error(
      `Auth failed: ${err.message ?? err}. Run \`npx wrangler login\` or set CLOUDFLARE_API_TOKEN with Zone.DNS.Edit.`,
    );
  }
}

async function api(token, method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(
      `${method} ${path} failed: ${JSON.stringify(json.errors ?? json)}`,
    );
  }
  return json;
}

async function main() {
  const token = loadToken();
  const log = [];

  // Sanity check token against zone API before DNS mutations
  const zone = await api(token, "GET", `/zones/${ZONE_ID}`);
  log.push({ zone: zone.result?.name, status: zone.result?.status });

  const dns = await api(token, "GET", `/zones/${ZONE_ID}/dns_records?per_page=100`);
  const songRecords = dns.result.filter((r) => r.name.includes("song"));
  log.push({ found: songRecords.map((r) => ({ id: r.id, type: r.type, name: r.name })) });

  for (const r of songRecords) {
    await api(token, "DELETE", `/zones/${ZONE_ID}/dns_records/${r.id}`);
    log.push({ deleted: r.id, type: r.type });
  }

  const domains = await api(token, "GET", `/accounts/${ACCOUNT}/workers/domains`);
  for (const d of domains.result.filter((x) => x.hostname === "song.opsec.rent")) {
    await api(token, "DELETE", `/accounts/${ACCOUNT}/workers/domains/${d.id}`);
    log.push({ deletedCustomDomain: d.id });
  }

  const created = await api(token, "POST", `/zones/${ZONE_ID}/dns_records`, {
    type: "A",
    name: "song",
    content: "192.0.2.0",
    proxied: true,
    ttl: 1,
    comment: "umbra worker route",
  });
  log.push({
    created: {
      id: created.result.id,
      name: created.result.name,
      type: created.result.type,
      proxied: created.result.proxied,
    },
  });

  writeFileSync("fix-dns-log.json", JSON.stringify(log, null, 2));
  console.log("Done. Created proxied A record for song.opsec.rent");
  console.log(JSON.stringify(log, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
