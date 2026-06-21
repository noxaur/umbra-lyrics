use std::{future::Future, time::Duration};

use futures_util::{
    future::{select, Either},
    pin_mut,
};
use serde::{Deserialize, Serialize};
use url::Url;
use worker::{AbortController, Delay, Fetch, Headers, Method, Request, RequestInit};

// Match legacy `/api/lyrics/lrclib` proxy budget; LRCLIB often needs 10–20s.
const DEFAULT_TIMEOUT_MS: u64 = 20_000;
const MAX_SEARCH_RESULTS: usize = 3;
const LRCLIB_BASE: &str = "https://lrclib.net/api";
const LYRICS_OVH_BASE: &str = "https://api.lyrics.ovh/v1";
const GENIUS_BASE: &str = "https://genius.com";
const USER_AGENT: &str = "umbra/1.0.0 (https://github.com/noxaur/umbra-lyrics)";
const LRCLIB_CLIENT: &str = USER_AGENT;
const LRCLIB_HEADERS: [(&str, &str); 2] =
    [("User-Agent", USER_AGENT), ("Lrclib-Client", LRCLIB_CLIENT)];
const GENIUS_USER_AGENT: &str = "Mozilla/5.0 (compatible; umbra/1.0.0)";
const STRONG_SYNC_MIN_LINES: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LyricsSource {
    LrclibExact,
    LrclibVariant,
    LyricsOvh,
    Genius,
}

impl LyricsSource {
    fn label(self) -> &'static str {
        match self {
            Self::LrclibExact => "LRCLIB exact",
            Self::LrclibVariant => "LRCLIB variant",
            Self::LyricsOvh => "lyrics.ovh",
            Self::Genius => "Genius",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsCandidate {
    pub source: LyricsSource,
    pub source_id: Option<String>,
    pub artist: String,
    pub track: String,
    pub duration: Option<f64>,
    pub plain_lyrics: String,
    pub synced_lyrics: Option<String>,
    pub synced: bool,
    pub instrumental: bool,
    pub diagnostics: Vec<LyricsDiagnostic>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LyricsInput {
    pub artist: String,
    pub track: String,
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LyricsConfig {
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LyricsResolution {
    pub candidates: Vec<LyricsCandidate>,
    pub warnings: Vec<LyricsSourceFailure>,
}

impl Default for LyricsConfig {
    fn default() -> Self {
        Self {
            timeout_ms: DEFAULT_TIMEOUT_MS,
        }
    }
}

impl LyricsConfig {
    #[allow(dead_code)]
    pub fn with_timeout_ms(timeout_ms: u64) -> Self {
        Self { timeout_ms }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LyricsSourceFailure {
    pub source: LyricsSource,
    pub diagnostic: LyricsDiagnostic,
}

impl LyricsSourceFailure {
    pub(crate) fn timeout(source: LyricsSource, timeout_ms: u64) -> Self {
        Self {
            source,
            diagnostic: LyricsDiagnostic {
                code: "source_timeout",
                message: format!("{} timed out after {timeout_ms} ms", source.label()),
                retryable: true,
            },
        }
    }

    pub(crate) fn transport(source: LyricsSource, message: impl Into<String>) -> Self {
        Self {
            source,
            diagnostic: LyricsDiagnostic {
                code: "source_unavailable",
                message: message.into(),
                retryable: true,
            },
        }
    }

    pub(crate) fn http(source: LyricsSource, status: u16) -> Self {
        Self {
            source,
            diagnostic: LyricsDiagnostic {
                code: "source_http_error",
                message: format!("{} returned HTTP {status}", source.label()),
                retryable: status >= 500,
            },
        }
    }

    pub(crate) fn invalid(source: LyricsSource, message: impl Into<String>) -> Self {
        Self {
            source,
            diagnostic: LyricsDiagnostic {
                code: "source_invalid_response",
                message: message.into(),
                retryable: false,
            },
        }
    }

    pub(crate) fn empty(source: LyricsSource, message: impl Into<String>) -> Self {
        Self {
            source,
            diagnostic: LyricsDiagnostic {
                code: "source_empty",
                message: message.into(),
                retryable: false,
            },
        }
    }

    pub(crate) fn junk(source: LyricsSource, message: impl Into<String>) -> Self {
        Self {
            source,
            diagnostic: LyricsDiagnostic {
                code: "source_junk_rejected",
                message: message.into(),
                retryable: false,
            },
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct LrclibSearchResult {
    id: u64,
    #[serde(default)]
    track_name: String,
    #[serde(default)]
    artist_name: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    instrumental: bool,
    #[serde(default)]
    plain_lyrics: Option<String>,
    #[serde(default)]
    synced_lyrics: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LyricsOvhResponse {
    #[serde(default)]
    lyrics: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeniusSearchResponse {
    #[serde(default)]
    response: Option<GeniusSearchEnvelope>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeniusSearchEnvelope {
    #[serde(default)]
    sections: Vec<GeniusSection>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeniusSection {
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    hits: Vec<GeniusHit>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeniusHit {
    #[serde(default)]
    result: Option<GeniusHitResult>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeniusHitResult {
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    full_title: Option<String>,
    #[serde(default)]
    primary_artist: Option<GeniusArtist>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeniusArtist {
    #[serde(default)]
    name: Option<String>,
}

fn trim_to_owned(value: &str) -> String {
    value.trim().to_owned()
}

fn normalize_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_whitespace() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn simplify_track_name(value: &str) -> String {
    let mut output = value.trim().to_owned();
    for suffix in [
        "official music video",
        "official video",
        "lyrics video",
        "lyric video",
        "music video",
        "visualizer",
        "official audio",
    ] {
        if output.to_ascii_lowercase().ends_with(suffix) {
            let new_len = output.len().saturating_sub(suffix.len());
            output.truncate(new_len);
            output = output.trim_matches([' ', '-', '|']).trim().to_owned();
        }
    }
    output
}

fn strip_parentheticals(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut depth = 0_u32;
    for character in value.chars() {
        match character {
            '(' | '[' | '（' | '【' => depth += 1,
            ')' | ']' | '）' | '】' => depth = depth.saturating_sub(1),
            _ if depth == 0 => output.push(character),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn text_lines(text: &str) -> usize {
    text.lines().filter(|line| !line.trim().is_empty()).count()
}

fn looks_like_junk(text: &str) -> bool {
    let lowered = text.to_ascii_lowercase();
    let markers = [
        "document.write",
        "<script",
        "cookie policy",
        "og:description",
        "lyrics.net",
        "you might also like",
        "embed",
        "translation",
        "contributors",
        "var opts",
    ];
    markers.iter().any(|marker| lowered.contains(marker))
}

fn cleaned_plain_lyrics(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() || looks_like_junk(trimmed) {
        return None;
    }
    let normalized = normalize_text(trimmed);
    if normalized.len() < 8 {
        return None;
    }
    Some(trimmed.to_owned())
}

fn strip_lrc_timestamps(text: &str) -> String {
    text.lines()
        .map(|line| {
            let mut rest = line.trim();
            while let Some(closing) = rest.strip_prefix('[').and_then(|value| value.find(']')) {
                let tag = &rest[1..closing + 1];
                let looks_like_timestamp =
                    tag.chars().any(|ch| ch.is_ascii_digit()) && tag.contains(':');
                if !looks_like_timestamp {
                    break;
                }
                rest = rest[closing + 2..].trim_start();
            }
            rest
        })
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[allow(clippy::too_many_arguments)]
fn lyrics_candidate(
    source: LyricsSource,
    source_id: Option<String>,
    artist: impl Into<String>,
    track: impl Into<String>,
    duration: Option<f64>,
    plain_lyrics: String,
    synced_lyrics: Option<String>,
    instrumental: bool,
    diagnostics: Vec<LyricsDiagnostic>,
) -> Option<LyricsCandidate> {
    let plain_lyrics = cleaned_plain_lyrics(&plain_lyrics).or_else(|| {
        synced_lyrics
            .as_deref()
            .map(strip_lrc_timestamps)
            .and_then(|text| cleaned_plain_lyrics(&text))
    });
    if plain_lyrics.is_none() && !instrumental {
        return None;
    }
    let plain_lyrics = plain_lyrics.unwrap_or_default();
    let synced = synced_lyrics
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    Some(LyricsCandidate {
        source,
        source_id,
        artist: artist.into().trim().to_owned(),
        track: track.into().trim().to_owned(),
        duration,
        plain_lyrics,
        synced_lyrics: synced_lyrics.map(|value| value.trim().to_owned()),
        synced,
        instrumental,
        diagnostics,
    })
}

fn candidate_line_count(candidate: &LyricsCandidate) -> usize {
    text_lines(
        candidate
            .synced_lyrics
            .as_deref()
            .unwrap_or(&candidate.plain_lyrics),
    )
}

fn is_strong_synced_candidate(candidate: &LyricsCandidate) -> bool {
    candidate.synced
        && !candidate.plain_lyrics.trim().is_empty()
        && candidate_line_count(candidate) >= STRONG_SYNC_MIN_LINES
        && !looks_like_junk(&candidate.plain_lyrics)
}

fn dedupe_candidates(mut candidates: Vec<LyricsCandidate>) -> Vec<LyricsCandidate> {
    let mut deduped = Vec::new();
    for candidate in candidates.drain(..) {
        if deduped.iter().any(|existing: &LyricsCandidate| {
            existing.source == candidate.source
                && existing.source_id == candidate.source_id
                && normalize_text(&existing.artist) == normalize_text(&candidate.artist)
                && normalize_text(&existing.track) == normalize_text(&candidate.track)
                && normalize_text(&existing.plain_lyrics) == normalize_text(&candidate.plain_lyrics)
        }) {
            continue;
        }
        deduped.push(candidate);
    }
    deduped
}

fn exact_variants(input: &LyricsInput) -> Vec<(String, String)> {
    let mut variants = Vec::new();
    let mut seen = Vec::<String>::new();
    let mut push = |artist: String, track: String| {
        let key = format!("{}\0{}", normalize_text(&artist), normalize_text(&track));
        if track.trim().is_empty() || seen.contains(&key) {
            return;
        }
        seen.push(key);
        variants.push((artist, track));
    };

    push(trim_to_owned(&input.artist), trim_to_owned(&input.track));

    let stripped = strip_parentheticals(&input.track);
    if stripped != input.track {
        push(trim_to_owned(&input.artist), stripped);
    }

    let simplified = simplify_track_name(&input.track);
    if simplified != input.track {
        push(trim_to_owned(&input.artist), simplified);
    }

    if !input.artist.trim().is_empty() && !input.track.trim().is_empty() {
        push(trim_to_owned(&input.track), trim_to_owned(&input.artist));
    }

    variants
}

fn variant_queries(input: &LyricsInput) -> Vec<(String, String)> {
    let mut variants = exact_variants(input);
    let simplified_artist = strip_parentheticals(&input.artist);
    let simplified_track = simplify_track_name(&input.track);
    let reversed = (trim_to_owned(&input.track), trim_to_owned(&input.artist));

    if simplified_artist != input.artist || simplified_track != input.track {
        variants.push((simplified_artist, simplified_track));
    }
    variants.push(reversed);

    let mut deduped = Vec::new();
    for pair in variants {
        let key = format!("{}\0{}", normalize_text(&pair.0), normalize_text(&pair.1));
        if deduped.iter().any(|existing: &(String, String)| {
            format!(
                "{}\0{}",
                normalize_text(&existing.0),
                normalize_text(&existing.1)
            ) == key
        }) {
            continue;
        }
        if pair.1.trim().is_empty() {
            continue;
        }
        deduped.push(pair);
    }
    let exact_key = format!(
        "{}\0{}",
        normalize_text(&input.artist),
        normalize_text(&input.track)
    );
    deduped.retain(|pair| {
        format!("{}\0{}", normalize_text(&pair.0), normalize_text(&pair.1)) != exact_key
    });
    deduped
}

async fn with_timeout<T, Fut>(
    source: LyricsSource,
    timeout_ms: u64,
    future: Fut,
) -> Result<T, LyricsSourceFailure>
where
    Fut: Future<Output = Result<T, LyricsSourceFailure>>,
{
    let timeout = Delay::from(Duration::from_millis(timeout_ms));
    pin_mut!(future, timeout);
    match select(future, timeout).await {
        Either::Left((result, _)) => result,
        Either::Right(((), _)) => Err(LyricsSourceFailure::timeout(source, timeout_ms)),
    }
}

async fn fetch_json<T: for<'de> Deserialize<'de>>(
    url: Url,
    source: LyricsSource,
    timeout_ms: u64,
    headers: &[(&str, &str)],
    label: &str,
) -> Result<T, LyricsSourceFailure> {
    with_timeout(source, timeout_ms, async move {
        let request_headers = Headers::new();
        for (name, value) in headers {
            request_headers.set(name, value).map_err(|error| {
                LyricsSourceFailure::transport(
                    source,
                    format!("{label} request header failed: {error}"),
                )
            })?;
        }

        let mut init = RequestInit::new();
        init.with_method(Method::Get).with_headers(request_headers);
        let request = Request::new_with_init(url.as_str(), &init).map_err(|error| {
            LyricsSourceFailure::transport(
                source,
                format!("{label} request creation failed: {error}"),
            )
        })?;

        let controller = AbortController::default();
        let signal = controller.signal();
        let fetch_request = Fetch::Request(request);
        let fetch = fetch_request.send_with_signal(&signal);
        let mut response = match fetch.await {
            Ok(response) => response,
            Err(error) => {
                controller.abort();
                return Err(LyricsSourceFailure::transport(
                    source,
                    format!("{label} request failed: {error}"),
                ));
            }
        };

        if !(200..300).contains(&response.status_code()) {
            return Err(LyricsSourceFailure::http(source, response.status_code()));
        }

        response.json::<T>().await.map_err(|error| {
            LyricsSourceFailure::invalid(source, format!("{label} returned invalid JSON: {error}"))
        })
    })
    .await
}

async fn fetch_text(
    url: Url,
    source: LyricsSource,
    timeout_ms: u64,
    label: &str,
    headers: &[(&str, &str)],
) -> Result<String, LyricsSourceFailure> {
    with_timeout(source, timeout_ms, async move {
        let request_headers = Headers::new();
        for (name, value) in headers {
            request_headers.set(name, value).map_err(|error| {
                LyricsSourceFailure::transport(
                    source,
                    format!("{label} request header failed: {error}"),
                )
            })?;
        }

        let mut init = RequestInit::new();
        init.with_method(Method::Get).with_headers(request_headers);
        let request = Request::new_with_init(url.as_str(), &init).map_err(|error| {
            LyricsSourceFailure::transport(
                source,
                format!("{label} request creation failed: {error}"),
            )
        })?;

        let controller = AbortController::default();
        let signal = controller.signal();
        let fetch_request = Fetch::Request(request);
        let fetch = fetch_request.send_with_signal(&signal);
        let mut response = match fetch.await {
            Ok(response) => response,
            Err(error) => {
                controller.abort();
                return Err(LyricsSourceFailure::transport(
                    source,
                    format!("{label} request failed: {error}"),
                ));
            }
        };

        if !(200..300).contains(&response.status_code()) {
            return Err(LyricsSourceFailure::http(source, response.status_code()));
        }

        response.text().await.map_err(|error| {
            LyricsSourceFailure::invalid(source, format!("{label} returned invalid text: {error}"))
        })
    })
    .await
}

async fn search_lrclib_exact(
    input: &LyricsInput,
    timeout_ms: u64,
) -> Result<Vec<LyricsCandidate>, LyricsSourceFailure> {
    let mut url = Url::parse(&format!("{LRCLIB_BASE}/search")).expect("static LRCLIB url");
    url.query_pairs_mut()
        .append_pair("artist_name", &input.artist)
        .append_pair("track_name", &input.track);

    let results: Vec<LrclibSearchResult> = fetch_json(
        url,
        LyricsSource::LrclibExact,
        timeout_ms,
        &LRCLIB_HEADERS,
        "LRCLIB",
    )
    .await?;
    convert_lrclib_results(LyricsSource::LrclibExact, input, results).await
}

async fn search_lrclib_variants(
    input: &LyricsInput,
    timeout_ms: u64,
) -> Result<Vec<LyricsCandidate>, LyricsSourceFailure> {
    let mut all = Vec::new();
    let mut last_failure = None;

    for (artist, track) in variant_queries(input) {
        let mut url = Url::parse(&format!("{LRCLIB_BASE}/search")).expect("static LRCLIB url");
        url.query_pairs_mut()
            .append_pair("artist_name", &artist)
            .append_pair("track_name", &track);
        match fetch_json::<Vec<LrclibSearchResult>>(
            url,
            LyricsSource::LrclibVariant,
            timeout_ms,
            &LRCLIB_HEADERS,
            "LRCLIB",
        )
        .await
        {
            Ok(results) => {
                all.extend(
                    convert_lrclib_results(
                        LyricsSource::LrclibVariant,
                        &LyricsInput {
                            artist: artist.clone(),
                            track: track.clone(),
                            duration: input.duration,
                        },
                        results,
                    )
                    .await?,
                );
            }
            Err(error) => last_failure = Some(error),
        }
    }

    if all.is_empty() {
        Err(last_failure.unwrap_or_else(|| {
            LyricsSourceFailure::empty(
                LyricsSource::LrclibVariant,
                "LRCLIB variant search returned no matches",
            )
        }))
    } else {
        Ok(all)
    }
}

async fn convert_lrclib_results(
    source: LyricsSource,
    input: &LyricsInput,
    results: Vec<LrclibSearchResult>,
) -> Result<Vec<LyricsCandidate>, LyricsSourceFailure> {
    let mut candidates = Vec::new();
    for result in results.into_iter().take(MAX_SEARCH_RESULTS) {
        let diagnostics = vec![LyricsDiagnostic {
            code: match source {
                LyricsSource::LrclibExact => "lrclib_exact",
                LyricsSource::LrclibVariant => "lrclib_variant",
                LyricsSource::LyricsOvh => "lyrics_ovh",
                LyricsSource::Genius => "genius",
            },
            message: format!("{} candidate", source.label()),
            retryable: false,
        }];

        let plain_lyrics = result
            .plain_lyrics
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_default();
        let synced_lyrics = result.synced_lyrics.clone();
        if let Some(candidate) = lyrics_candidate(
            source,
            Some(result.id.to_string()),
            if result.artist_name.trim().is_empty() {
                input.artist.clone()
            } else {
                result.artist_name.clone()
            },
            if result.track_name.trim().is_empty() {
                input.track.clone()
            } else {
                result.track_name.clone()
            },
            result.duration.or(input.duration),
            plain_lyrics,
            synced_lyrics,
            result.instrumental,
            diagnostics,
        ) {
            candidates.push(candidate);
        } else {
            continue;
        }
    }
    Ok(candidates)
}

async fn search_lyrics_ovh(
    input: &LyricsInput,
    timeout_ms: u64,
) -> Result<Vec<LyricsCandidate>, LyricsSourceFailure> {
    let artist = url::form_urlencoded::byte_serialize(input.artist.as_bytes()).collect::<String>();
    let track = url::form_urlencoded::byte_serialize(input.track.as_bytes()).collect::<String>();
    let url =
        Url::parse(&format!("{LYRICS_OVH_BASE}/{artist}/{track}")).expect("static lyrics.ovh url");
    let response: LyricsOvhResponse = fetch_json(
        url,
        LyricsSource::LyricsOvh,
        timeout_ms,
        &[("User-Agent", USER_AGENT)],
        "lyrics.ovh",
    )
    .await?;
    let Some(lyrics) = response.lyrics else {
        return Err(LyricsSourceFailure::empty(
            LyricsSource::LyricsOvh,
            "lyrics.ovh returned no lyrics",
        ));
    };
    let candidate = lyrics_candidate(
        LyricsSource::LyricsOvh,
        Some(format!("{}::{}", input.artist, input.track)),
        input.artist.clone(),
        input.track.clone(),
        input.duration,
        lyrics,
        None,
        false,
        vec![LyricsDiagnostic {
            code: "lyrics_ovh",
            message: "lyrics.ovh candidate".into(),
            retryable: false,
        }],
    )
    .ok_or_else(|| {
        LyricsSourceFailure::junk(
            LyricsSource::LyricsOvh,
            "lyrics.ovh response looked like junk",
        )
    })?;
    Ok(vec![candidate])
}

async fn search_genius(
    input: &LyricsInput,
    timeout_ms: u64,
) -> Result<Vec<LyricsCandidate>, LyricsSourceFailure> {
    let query = [input.artist.trim(), input.track.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if query.is_empty() {
        return Err(LyricsSourceFailure::empty(
            LyricsSource::Genius,
            "Genius query was empty",
        ));
    }

    let query = url::form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>();
    let url = Url::parse(&format!(
        "{GENIUS_BASE}/api/search/multi?per_page=5&q={query}"
    ))
    .expect("static Genius url");
    let response: GeniusSearchResponse = fetch_json(
        url,
        LyricsSource::Genius,
        timeout_ms,
        &[("User-Agent", GENIUS_USER_AGENT)],
        "Genius",
    )
    .await?;
    let mut candidates = Vec::new();

    for hit in response
        .response
        .into_iter()
        .flat_map(|response| response.sections)
        .filter(|section| section.r#type == "song")
        .flat_map(|section| section.hits)
        .filter_map(|hit| hit.result)
        .take(MAX_SEARCH_RESULTS)
    {
        let Some(url) = hit.url else {
            continue;
        };
        let html = fetch_text(
            Url::parse(&url).map_err(|error| {
                LyricsSourceFailure::transport(
                    LyricsSource::Genius,
                    format!("Genius URL parse failed: {error}"),
                )
            })?,
            LyricsSource::Genius,
            timeout_ms,
            "Genius",
            &[("User-Agent", GENIUS_USER_AGENT)],
        )
        .await?;
        let Some(lyrics) = parse_genius_html(&html) else {
            continue;
        };
        if let Some(candidate) = lyrics_candidate(
            LyricsSource::Genius,
            hit.id.map(|id| id.to_string()),
            hit.primary_artist
                .and_then(|artist| artist.name)
                .unwrap_or_else(|| input.artist.clone()),
            hit.title
                .or(hit.full_title)
                .unwrap_or_else(|| input.track.clone()),
            input.duration,
            lyrics,
            None,
            false,
            vec![LyricsDiagnostic {
                code: "genius",
                message: "Genius page lyrics".into(),
                retryable: false,
            }],
        ) {
            candidates.push(candidate);
        }
    }

    if candidates.is_empty() {
        Err(LyricsSourceFailure::empty(
            LyricsSource::Genius,
            "Genius returned no usable lyrics",
        ))
    } else {
        Ok(candidates)
    }
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn strip_html_tags(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if in_tag {
            if character == '>' {
                in_tag = false;
            }
            continue;
        }

        match character {
            '<' => {
                let mut tag = String::new();
                for next in chars.by_ref() {
                    if next == '>' {
                        break;
                    }
                    tag.push(next);
                }
                let lowered = tag.to_ascii_lowercase();
                if lowered.starts_with("br") {
                    output.push('\n');
                }
                if lowered.starts_with("/div") || lowered.starts_with("/p") {
                    output.push('\n');
                }
            }
            '&' => {
                let mut entity = String::from("&");
                while let Some(next) = chars.peek().copied() {
                    entity.push(next);
                    chars.next();
                    if next == ';' || entity.len() > 12 {
                        break;
                    }
                }
                output.push_str(&decode_html_entities(&entity));
            }
            _ => output.push(character),
        }
    }
    output
}

pub fn parse_genius_html(html: &str) -> Option<String> {
    if looks_like_junk(html) {
        return None;
    }

    let container_patterns = [
        r#"data-lyrics-container="true""#,
        r#"class="Lyrics""#,
        r#"class="lyrics""#,
    ];

    for pattern in container_patterns {
        if let Some(start) = html.find(pattern) {
            let slice = &html[start..];
            let Some(open) = slice.find('>') else {
                continue;
            };
            let slice = &slice[open + 1..];
            let Some(close) = slice.find("</div>") else {
                continue;
            };
            let text = strip_html_tags(&slice[..close]).trim().to_owned();
            if !text.is_empty() && !looks_like_junk(&text) {
                return Some(text);
            }
        }
    }

    None
}

fn strong_candidate_exists(candidates: &[LyricsCandidate]) -> bool {
    candidates.iter().any(is_strong_synced_candidate)
}

pub async fn run_trusted_lyrics_cascade(
    input: &LyricsInput,
    config: &LyricsConfig,
) -> LyricsResolution {
    let mut candidates = Vec::new();
    let mut warnings = Vec::new();

    match search_lrclib_exact(input, config.timeout_ms).await {
        Ok(found) => {
            let strong = strong_candidate_exists(&found);
            candidates.extend(found);
            if strong {
                return LyricsResolution {
                    candidates: dedupe_candidates(candidates),
                    warnings,
                };
            }
        }
        Err(error) => warnings.push(error),
    }

    match search_lrclib_variants(input, config.timeout_ms).await {
        Ok(found) => {
            let strong = strong_candidate_exists(&found);
            candidates.extend(found);
            if strong {
                return LyricsResolution {
                    candidates: dedupe_candidates(candidates),
                    warnings,
                };
            }
        }
        Err(error) => warnings.push(error),
    }

    match search_lyrics_ovh(input, config.timeout_ms).await {
        Ok(found) => candidates.extend(found),
        Err(error) => warnings.push(error),
    }

    match search_genius(input, config.timeout_ms).await {
        Ok(found) => candidates.extend(found),
        Err(error) => warnings.push(error),
    }

    LyricsResolution {
        candidates: dedupe_candidates(candidates),
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use super::*;

    fn candidate(source: LyricsSource, synced: bool, plain_lyrics: &str) -> LyricsCandidate {
        LyricsCandidate {
            source,
            source_id: Some("1".into()),
            artist: "Artist".into(),
            track: "Song".into(),
            duration: Some(200.0),
            plain_lyrics: plain_lyrics.into(),
            synced_lyrics: synced.then_some(
                "[00:00.00] One\n[00:01.00] Two\n[00:02.00] Three\n[00:03.00] Four".into(),
            ),
            synced,
            instrumental: false,
            diagnostics: vec![LyricsDiagnostic {
                code: "test",
                message: "test".into(),
                retryable: false,
            }],
        }
    }

    #[test]
    fn genius_parser_accepts_real_lyric_container() {
        let html = include_str!("../../../../tests/fixtures/scraper/genius-lyrics.html");
        let parsed = parse_genius_html(html).expect("lyrics");
        assert!(parsed.contains("Look at the stars"));
    }

    #[test]
    fn genius_parser_rejects_description_pages() {
        let html = include_str!("../../../../tests/fixtures/lyrics-quality/genius-description.txt");
        assert!(parse_genius_html(html).is_none());
    }

    #[test]
    fn scraper_junk_is_rejected() {
        let junk = include_str!("../../../../tests/fixtures/lyrics-quality/scraper-junk.txt");
        assert!(cleaned_plain_lyrics(junk).is_none());
    }

    #[test]
    fn shared_candidate_serializes_source_and_diagnostics() {
        let candidate = candidate(LyricsSource::LyricsOvh, false, "One\nTwo");
        let json = serde_json::to_value(candidate).expect("json");
        assert_eq!(json["source"], "lyrics_ovh");
        assert_eq!(json["artist"], "Artist");
        assert!(json["diagnostics"].is_array());
    }

    #[test]
    fn strong_lrclib_exact_short_circuits_fallbacks() {
        futures::executor::block_on(async {
            let calls = Rc::new(RefCell::new(Vec::new()));
            let input = LyricsInput {
                artist: "Artist".into(),
                track: "Song".into(),
                duration: Some(200.0),
            };

            let exact_calls = Rc::clone(&calls);
            let exact = move |_: &LyricsInput| {
                exact_calls.borrow_mut().push("exact");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![LyricsCandidate {
                        source: LyricsSource::LrclibExact,
                        source_id: Some("1".into()),
                        artist: "Artist".into(),
                        track: "Song".into(),
                        duration: Some(200.0),
                        plain_lyrics: "One\nTwo\nThree\nFour".into(),
                        synced_lyrics: Some(
                            "[00:00.00] One\n[00:01.00] Two\n[00:02.00] Three\n[00:03.00] Four"
                                .into(),
                        ),
                        synced: true,
                        instrumental: false,
                        diagnostics: vec![],
                    }])
                }
            };
            let variant_calls = Rc::clone(&calls);
            let variant = move |_: &LyricsInput| {
                variant_calls.borrow_mut().push("variant");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::LrclibVariant,
                        false,
                        "later",
                    )])
                }
            };
            let ovh_calls = Rc::clone(&calls);
            let ovh = move |_: &LyricsInput| {
                ovh_calls.borrow_mut().push("ovh");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::LyricsOvh,
                        false,
                        "later",
                    )])
                }
            };
            let genius_calls = Rc::clone(&calls);
            let genius = move |_: &LyricsInput| {
                genius_calls.borrow_mut().push("genius");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::Genius,
                        false,
                        "later",
                    )])
                }
            };

            let resolution = run_cascade_for_tests(&input, exact, variant, ovh, genius).await;
            assert_eq!(&*calls.borrow(), &vec!["exact"]);
            assert_eq!(resolution.candidates.len(), 1);
            assert_eq!(resolution.candidates[0].source, LyricsSource::LrclibExact);
        });
    }

    #[test]
    fn cascade_keeps_order_when_exact_is_weak() {
        futures::executor::block_on(async {
            let calls = Rc::new(RefCell::new(Vec::new()));
            let input = LyricsInput {
                artist: "Artist".into(),
                track: "Song".into(),
                duration: Some(200.0),
            };

            let exact_calls = Rc::clone(&calls);
            let exact = move |_: &LyricsInput| {
                exact_calls.borrow_mut().push("exact");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::LrclibExact,
                        false,
                        "weak",
                    )])
                }
            };
            let variant_calls = Rc::clone(&calls);
            let variant = move |_: &LyricsInput| {
                variant_calls.borrow_mut().push("variant");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::LrclibVariant,
                        false,
                        "weak",
                    )])
                }
            };
            let ovh_calls = Rc::clone(&calls);
            let ovh = move |_: &LyricsInput| {
                ovh_calls.borrow_mut().push("ovh");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::LyricsOvh,
                        false,
                        "weak",
                    )])
                }
            };
            let genius_calls = Rc::clone(&calls);
            let genius = move |_: &LyricsInput| {
                genius_calls.borrow_mut().push("genius");
                async {
                    Ok::<_, LyricsSourceFailure>(vec![candidate(
                        LyricsSource::Genius,
                        false,
                        "weak",
                    )])
                }
            };

            let resolution = run_cascade_for_tests(&input, exact, variant, ovh, genius).await;
            assert_eq!(&*calls.borrow(), &vec!["exact", "variant", "ovh", "genius"]);
            assert!(resolution
                .candidates
                .iter()
                .any(|candidate| candidate.source == LyricsSource::Genius));
        });
    }

    #[test]
    fn failure_diagnostics_remain_structured() {
        let timeout = LyricsSourceFailure::timeout(LyricsSource::LyricsOvh, 12_000);
        assert_eq!(timeout.diagnostic.code, "source_timeout");
        let transport = LyricsSourceFailure::transport(LyricsSource::Genius, "boom");
        assert_eq!(transport.diagnostic.code, "source_unavailable");
        let junk = LyricsSourceFailure::junk(LyricsSource::Genius, "junk");
        assert_eq!(junk.diagnostic.code, "source_junk_rejected");
    }

    async fn run_cascade_for_tests<
        Exact,
        Variant,
        Ovh,
        Genius,
        ExactFut,
        VariantFut,
        OvhFut,
        GeniusFut,
    >(
        input: &LyricsInput,
        exact: Exact,
        variant: Variant,
        ovh: Ovh,
        genius: Genius,
    ) -> LyricsResolution
    where
        Exact: Fn(&LyricsInput) -> ExactFut,
        Variant: Fn(&LyricsInput) -> VariantFut,
        Ovh: Fn(&LyricsInput) -> OvhFut,
        Genius: Fn(&LyricsInput) -> GeniusFut,
        ExactFut: Future<Output = Result<Vec<LyricsCandidate>, LyricsSourceFailure>>,
        VariantFut: Future<Output = Result<Vec<LyricsCandidate>, LyricsSourceFailure>>,
        OvhFut: Future<Output = Result<Vec<LyricsCandidate>, LyricsSourceFailure>>,
        GeniusFut: Future<Output = Result<Vec<LyricsCandidate>, LyricsSourceFailure>>,
    {
        let mut candidates = Vec::new();

        let exact_candidates = exact(input).await.unwrap();
        let strong = strong_candidate_exists(&exact_candidates);
        candidates.extend(exact_candidates);
        if strong {
            return LyricsResolution {
                candidates: dedupe_candidates(candidates),
                warnings: Vec::new(),
            };
        }

        let variant_candidates = variant(input).await.unwrap();
        let strong = strong_candidate_exists(&variant_candidates);
        candidates.extend(variant_candidates);
        if strong {
            return LyricsResolution {
                candidates: dedupe_candidates(candidates),
                warnings: Vec::new(),
            };
        }

        candidates.extend(ovh(input).await.unwrap());
        candidates.extend(genius(input).await.unwrap());
        LyricsResolution {
            candidates: dedupe_candidates(candidates),
            warnings: Vec::new(),
        }
    }
}
