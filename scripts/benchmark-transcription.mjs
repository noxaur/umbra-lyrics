#!/usr/bin/env node
/**
 * Benchmark transcription quality against reference YouTube IDs.
 * Usage: node scripts/benchmark-transcription.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:5173"

const REFERENCES = [
  { id: "dQw4w9WgXcQ", label: "Western pop" },
  { id: "Ktk_EDLDPeY", label: "JP anime" },
]

async function benchmarkOne(videoId, label) {
  const started = Date.now()
  const res = await fetch(`${BASE}/api/lyrics/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId,
      mode: "sample",
      durationSec: 240,
    }),
  })
  const elapsed = Date.now() - started
  const body = await res.json().catch(() => ({}))
  const segments = body.segments ?? []
  const coverageSec = body.coverageSec ?? segments.at(-1)?.end ?? 0

  return {
    videoId,
    label,
    ok: res.ok,
    elapsedMs: elapsed,
    segmentCount: segments.length,
    coverageSec,
    vocalDensity: body.vocalDensity ?? null,
    partial: body.partial ?? false,
    textPreview: (body.text ?? "").slice(0, 120),
  }
}

const results = []
for (const ref of REFERENCES) {
  results.push(await benchmarkOne(ref.id, ref.label))
}

console.log(JSON.stringify({ base: BASE, results }, null, 2))
