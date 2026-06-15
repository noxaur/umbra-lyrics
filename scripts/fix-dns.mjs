#!/usr/bin/env node
/**
 * Replace Worker-type DNS record with standard proxied A record for song.opsec.rent.
 * Run after `wrangler deploy` with zone route config.
 *
 * Usage: node scripts/fix-dns.mjs
 * Requires wrangler OAuth login (~/.config/.wrangler/config/default.toml).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT = "865dded96630ca6a533584a80efad356";
const ZONE_ID = "1366ca1f4d9f61f42895693748650612";

function loadToken() {
  const toml = readFileSync(
    join(homedir(), ".config/.wrangler/config/default.toml"),
    "utf8",
  );
  const m = toml.match(/oauth_token = "([^"]+)"/);
  if (!m) throw new Error("Run `npx wrangler login` first");
  return m[1];
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
    comment: "song-kara worker route",
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
