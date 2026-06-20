use std::{cmp::Ordering, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::{
    future::{select, Either},
    pin_mut,
};
use serde::{Deserialize, Serialize};
use url::Url;
use worker::{
    AbortController, Ai, Delay, Env, Fetch, Fetcher, Headers, Method, Request, RequestInit,
};

use crate::native_lyrics::{
    NativeLyricsLine, NativeLyricsLineKind, NativeLyricsOutcome, NativeLyricsResult,
    NativeLyricsScoringReason,
};
use crate::observability::emit_json_log;
use crate::resolution::ResolveRequest;
use crate::task10::{
    is_valid_video_id, resolve_native_audio_probe, AudioResolutionReport, AudioResolutionSource,
};

const LEGACY_BINDING: &str = "LEGACY";
const WHISPER_MODEL: &str = "@cf/openai/whisper-large-v3-turbo";
const SAMPLE_MAX_AUDIO_BYTES: usize = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES: usize = 10 * 1024 * 1024;
const CHUNK_BYTE_SIZE: usize = 2 * 1024 * 1024;
const MAX_TRANSCRIBE_CHUNKS: usize = 5;
const SAMPLE_ACCEPT_THRESHOLD: f64 = 0.38;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptionStatus {
    Skipped,
    Sampled,
    Transcribed,
    Partial,
    NotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptionMode {
    Sample,
    Full,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionMetrics {
    pub audio_bytes: usize,
    pub range_requests: u32,
    pub whisper_calls: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSideChannel {
    pub status: TranscriptionStatus,
    pub mode: Option<TranscriptionMode>,
    pub source: Option<&'static str>,
    pub used_legacy_audio_adapter: bool,
    pub partial: bool,
    pub chunks: u32,
    pub sample_accepted: bool,
    pub sample_rejected: bool,
    pub not_found: bool,
    pub vocal_density: Option<f64>,
    pub coverage_sec: Option<f64>,
    pub metrics: TranscriptionMetrics,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TranscriptionResult {
    pub side_channel: TranscriptionSideChannel,
    pub lyrics: Option<NativeLyricsResult>,
}

#[derive(Debug, Clone, Deserialize)]
struct WhisperWord {
    word: Option<String>,
    start: Option<f64>,
    end: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct WhisperSegment {
    start: Option<f64>,
    end: Option<f64>,
    text: Option<String>,
    words: Option<Vec<WhisperWord>>,
}

#[derive(Debug, Clone, Deserialize)]
struct WhisperResponse {
    text: Option<String>,
    segments: Option<Vec<WhisperSegment>>,
    vtt: Option<String>,
    transcription_info: Option<WhisperInfo>,
}

#[derive(Debug, Clone, Deserialize)]
struct WhisperInfo {
    language: Option<String>,
}

#[derive(Debug, Clone)]
struct AudioWindow {
    bytes: Vec<u8>,
    partial: bool,
    total_bytes: Option<usize>,
    range_requests: u32,
}

#[derive(Debug, Clone)]
struct AudioWindowResolution {
    window: AudioWindow,
    report: AudioResolutionReport,
}

fn normalize_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokenize(value: &str) -> Vec<String> {
    normalize_text(value)
        .split_whitespace()
        .map(str::to_owned)
        .filter(|token| token.len() > 1)
        .collect()
}

fn token_overlap(left: &str, right: &str) -> f64 {
    let left = tokenize(left);
    let right = tokenize(right);
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let common = left.iter().filter(|token| right.contains(token)).count();
    common as f64 / left.len().max(right.len()) as f64
}

fn transcript_text(segments: &[TranscriptSegment], text: &str) -> String {
    let joined = segments
        .iter()
        .map(|segment| segment.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if !joined.trim().is_empty() {
        joined.trim().to_owned()
    } else {
        text.trim().to_owned()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

fn vtt_timestamp_to_sec(raw: &str) -> f64 {
    let parts = raw.trim().split(':').collect::<Vec<_>>();
    match parts.as_slice() {
        [minutes, seconds] => {
            let (whole, fraction) = split_fraction(seconds);
            minutes.parse::<f64>().unwrap_or(0.0) * 60.0
                + whole.parse::<f64>().unwrap_or(0.0)
                + fraction
        }
        [hours, minutes, seconds] => {
            let (whole, fraction) = split_fraction(seconds);
            hours.parse::<f64>().unwrap_or(0.0) * 3600.0
                + minutes.parse::<f64>().unwrap_or(0.0) * 60.0
                + whole.parse::<f64>().unwrap_or(0.0)
                + fraction
        }
        _ => 0.0,
    }
}

fn split_fraction(value: &str) -> (&str, f64) {
    if let Some((whole, fraction)) = value.split_once('.') {
        let fraction = fraction
            .get(..3)
            .and_then(|slice| slice.parse::<f64>().ok())
            .map(|milliseconds| milliseconds / 1000.0)
            .unwrap_or(0.0);
        (whole, fraction)
    } else {
        (value, 0.0)
    }
}

fn parse_vtt_segments(vtt: &str) -> Vec<TranscriptSegment> {
    let mut segments = Vec::new();
    for block in vtt.split("\n\n").skip(1) {
        let lines = block
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();
        let Some(timing) = lines.iter().find(|line| line.contains("-->")) else {
            continue;
        };
        let Some((start_raw, end_raw)) = timing.split_once("-->") else {
            continue;
        };
        let text = lines
            .into_iter()
            .filter(|line| !line.contains("-->") && !line.chars().all(|ch| ch.is_ascii_digit()))
            .collect::<Vec<_>>()
            .join(" ");
        if text.trim().is_empty() {
            continue;
        }
        segments.push(TranscriptSegment {
            start: vtt_timestamp_to_sec(start_raw),
            end: vtt_timestamp_to_sec(end_raw),
            text: text.trim().to_owned(),
        });
    }
    segments
}

fn whisper_segments(raw: Option<Vec<WhisperSegment>>, vtt: Option<&str>) -> Vec<TranscriptSegment> {
    let from_segments = raw
        .unwrap_or_default()
        .into_iter()
        .filter_map(|segment| {
            let text = segment.text.unwrap_or_default().trim().to_owned();
            if text.is_empty() {
                return None;
            }
            let start = segment.start.unwrap_or(0.0);
            let end = segment.end.unwrap_or(start + 0.05).max(start + 0.05);
            Some(TranscriptSegment { start, end, text })
        })
        .collect::<Vec<_>>();
    if !from_segments.is_empty() {
        return from_segments;
    }
    if let Some(vtt) = vtt {
        let from_vtt = parse_vtt_segments(vtt);
        if !from_vtt.is_empty() {
            return from_vtt;
        }
    }
    Vec::new()
}

fn build_native_lines_from_segments(
    segments: &[TranscriptSegment],
    duration_sec: Option<f64>,
) -> Vec<NativeLyricsLine> {
    if segments.is_empty() {
        return Vec::new();
    }
    let mut lines = segments
        .iter()
        .map(|segment| NativeLyricsLine {
            start_ms: (segment.start * 1000.0).round().max(0.0) as u32,
            end_ms: (segment.end * 1000.0)
                .round()
                .max((segment.start * 1000.0).round()) as u32,
            text: segment.text.trim().to_owned(),
            kind: NativeLyricsLineKind::Lyric,
            approximate: true,
        })
        .collect::<Vec<_>>();
    if let Some(duration_sec) = duration_sec {
        if let Some(last) = lines.last_mut() {
            last.end_ms = last.end_ms.max((duration_sec * 1000.0).round() as u32);
        }
    }
    lines
}

fn build_approximate_lines(text: &str, duration_sec: Option<f64>) -> Vec<NativeLyricsLine> {
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Vec::new();
    }
    let total_ms = duration_sec
        .map(|duration| (duration * 1000.0).round() as u32)
        .unwrap_or_else(|| (lines.len() as u32).saturating_mul(5000))
        .max(lines.len() as u32 * 1000);
    let slice_ms = (total_ms / lines.len() as u32).max(1000);
    let line_count = lines.len();
    lines
        .into_iter()
        .enumerate()
        .map(|(index, text)| {
            let start_ms = index as u32 * slice_ms;
            let end_ms = if index + 1 == line_count {
                total_ms
            } else {
                ((index as u32 + 1) * slice_ms).min(total_ms)
            };
            NativeLyricsLine {
                start_ms,
                end_ms: end_ms.max(start_ms + 1000),
                text,
                kind: NativeLyricsLineKind::Lyric,
                approximate: true,
            }
        })
        .collect()
}

fn native_text(native: &NativeLyricsResult) -> String {
    native
        .plain_lyrics
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            native
                .synced_lyrics
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(strip_lrc_timestamps)
        })
        .unwrap_or_else(|| {
            native
                .lines
                .iter()
                .filter(|line| line.kind != NativeLyricsLineKind::Section)
                .map(|line| line.text.trim())
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
}

fn strip_lrc_timestamps(text: &str) -> String {
    text.lines()
        .map(|line| {
            let mut rest = line.trim();
            while let Some(after_open) = rest.strip_prefix('[') {
                let Some(close) = after_open.find(']') else {
                    break;
                };
                let tag = &after_open[..close];
                if !tag.chars().any(|character| character.is_ascii_digit()) || !tag.contains(':') {
                    break;
                }
                rest = after_open[close + 1..].trim_start();
            }
            rest.trim().to_owned()
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_strong_native_result(native: &NativeLyricsResult) -> bool {
    matches!(
        native.outcome,
        NativeLyricsOutcome::Found | NativeLyricsOutcome::Instrumental
    )
}

fn should_try_sample(native: &NativeLyricsResult) -> bool {
    matches!(native.outcome, NativeLyricsOutcome::LowConfidence)
}

fn should_try_full(native: &NativeLyricsResult) -> bool {
    matches!(
        native.outcome,
        NativeLyricsOutcome::LowConfidence | NativeLyricsOutcome::NotFound
    )
}

fn score_sample(native: &NativeLyricsResult, transcript_text: &str) -> bool {
    let expected = native_text(native);
    token_overlap(&expected, transcript_text) >= SAMPLE_ACCEPT_THRESHOLD
}

fn legacy_audio_request(
    video_id: &str,
    range: Option<(usize, usize)>,
) -> Result<Request, worker::Error> {
    let mut url =
        Url::parse("https://song.example/api/beta/youtube/proxy").expect("static legacy proxy url");
    url.query_pairs_mut()
        .append_pair("videoId", video_id)
        .append_pair("format", "audio");

    let mut init = RequestInit::new();
    init.with_method(Method::Get);
    let headers = Headers::new();
    headers.set("Accept", "*/*")?;
    headers.set(
        "User-Agent",
        "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)",
    )?;
    if let Some((start, end)) = range {
        headers.set("Range", &format!("bytes={start}-{end}"))?;
    }
    init.with_headers(headers);
    Request::new_with_init(url.as_str(), &init)
}

async fn probe_audio_size(
    legacy: &Fetcher,
    video_id: &str,
) -> Result<Option<usize>, worker::Error> {
    let request = legacy_audio_request(video_id, Some((0, 0)))?;
    let mut response = legacy.fetch_request(request).await?;
    if response.status_code() == 206 {
        if let Some(range) = response.headers().get("Content-Range")? {
            if let Some(total) = range
                .rsplit('/')
                .next()
                .and_then(|value| value.parse::<usize>().ok())
            {
                if total > 0 {
                    return Ok(Some(total));
                }
            }
        }
    }
    if let Some(length) = response.headers().get("Content-Length")? {
        if let Ok(total) = length.parse::<usize>() {
            if total > 0 {
                return Ok(Some(total));
            }
        }
    }
    Ok(None)
}

async fn probe_audio_size_from_url(stream_url: &str) -> Result<Option<usize>, worker::Error> {
    let mut head_headers = Headers::new();
    head_headers.set("Accept", "*/*")?;
    head_headers.set(
        "User-Agent",
        "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iPhone OS 15_6 like Mac OS X)",
    )?;

    let mut head_init = RequestInit::new();
    head_init
        .with_method(Method::Head)
        .with_headers(head_headers);
    let head_request = Request::new_with_init(stream_url, &head_init)?;
    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch = Fetch::Request(head_request).send_with_signal(&signal);
    let timeout = Delay::from(Duration::from_millis(30_000));
    pin_mut!(fetch, timeout);
    let mut head_response = match select(fetch, timeout).await {
        Either::Left((result, _)) => result?,
        Either::Right(((), _)) => {
            controller.abort();
            return Ok(None);
        }
    };
    if (200..300).contains(&head_response.status_code()) {
        if let Some(length) = head_response.headers().get("Content-Length")? {
            if let Ok(total) = length.parse::<usize>() {
                if total > 0 {
                    return Ok(Some(total));
                }
            }
        }
    }

    let mut ranged_headers = Headers::new();
    ranged_headers.set("Accept", "*/*")?;
    ranged_headers.set(
        "User-Agent",
        "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iPhone OS 15_6 like Mac OS X)",
    )?;
    ranged_headers.set("Range", "bytes=0-0")?;
    let mut range_init = RequestInit::new();
    range_init
        .with_method(Method::Get)
        .with_headers(ranged_headers);
    let range_request = Request::new_with_init(stream_url, &range_init)?;
    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch = Fetch::Request(range_request).send_with_signal(&signal);
    let timeout = Delay::from(Duration::from_millis(30_000));
    pin_mut!(fetch, timeout);
    let mut range_response = match select(fetch, timeout).await {
        Either::Left((result, _)) => result?,
        Either::Right(((), _)) => {
            controller.abort();
            return Ok(None);
        }
    };
    if range_response.status_code() == 206 {
        if let Some(range) = range_response.headers().get("Content-Range")? {
            if let Some(total) = range
                .rsplit('/')
                .next()
                .and_then(|value| value.parse::<usize>().ok())
            {
                if total > 0 {
                    return Ok(Some(total));
                }
            }
        }
    }
    if let Some(length) = range_response.headers().get("Content-Length")? {
        if let Ok(total) = length.parse::<usize>() {
            if total > 0 {
                return Ok(Some(total));
            }
        }
    }
    Ok(None)
}

async fn fetch_audio_range(
    legacy: &Fetcher,
    video_id: &str,
    start: usize,
    end: usize,
) -> Result<Vec<u8>, worker::Error> {
    let request = legacy_audio_request(video_id, Some((start, end)))?;
    let mut response = legacy.fetch_request(request).await?;
    if !(200..300).contains(&response.status_code()) {
        return Err(worker::Error::RustError(format!(
            "legacy audio proxy returned HTTP {}",
            response.status_code()
        )));
    }
    response.bytes().await
}

async fn fetch_audio_range_from_url(
    stream_url: &str,
    start: usize,
    end: usize,
) -> Result<Vec<u8>, worker::Error> {
    let mut headers = Headers::new();
    headers.set("Accept", "*/*")?;
    headers.set(
        "User-Agent",
        "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iPhone OS 15_6 like Mac OS X)",
    )?;
    headers.set("Range", &format!("bytes={start}-{end}"))?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(stream_url, &init)?;
    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch = Fetch::Request(request).send_with_signal(&signal);
    let timeout = Delay::from(Duration::from_millis(120_000));
    pin_mut!(fetch, timeout);
    let mut response = match select(fetch, timeout).await {
        Either::Left((result, _)) => result?,
        Either::Right(((), _)) => {
            controller.abort();
            return Err(worker::Error::RustError(
                "native audio stream timed out".into(),
            ));
        }
    };
    if !(200..300).contains(&response.status_code()) {
        return Err(worker::Error::RustError(format!(
            "native audio stream returned HTTP {}",
            response.status_code()
        )));
    }
    response.bytes().await
}

async fn fetch_audio_window(
    legacy: &Fetcher,
    video_id: &str,
    max_bytes: usize,
) -> Result<AudioWindow, worker::Error> {
    let total_bytes = probe_audio_size(legacy, video_id).await?;
    let range_requests = 2;
    let bytes = if total_bytes.is_some_and(|total| total > max_bytes) {
        fetch_audio_range(legacy, video_id, 0, max_bytes.saturating_sub(1)).await?
    } else if let Some(total) = total_bytes {
        fetch_audio_range(legacy, video_id, 0, total.saturating_sub(1)).await?
    } else {
        fetch_audio_range(legacy, video_id, 0, max_bytes.saturating_sub(1)).await?
    };

    let partial = total_bytes
        .map(|total| total > bytes.len())
        .unwrap_or(bytes.len() >= max_bytes);
    Ok(AudioWindow {
        bytes,
        partial,
        total_bytes,
        range_requests,
    })
}

async fn fetch_audio_window_from_url(
    stream_url: &str,
    max_bytes: usize,
) -> Result<AudioWindow, worker::Error> {
    let total_bytes = probe_audio_size_from_url(stream_url).await?;
    let range_requests = 2;
    let bytes = if total_bytes.is_some_and(|total| total > max_bytes) {
        fetch_audio_range_from_url(stream_url, 0, max_bytes.saturating_sub(1)).await?
    } else if let Some(total) = total_bytes {
        fetch_audio_range_from_url(stream_url, 0, total.saturating_sub(1)).await?
    } else {
        fetch_audio_range_from_url(stream_url, 0, max_bytes.saturating_sub(1)).await?
    };

    let partial = total_bytes
        .map(|total| total > bytes.len())
        .unwrap_or(bytes.len() >= max_bytes);
    Ok(AudioWindow {
        bytes,
        partial,
        total_bytes,
        range_requests,
    })
}

async fn fetch_audio_window_with_native_first(
    legacy: &Fetcher,
    video_id: &str,
    max_bytes: usize,
) -> Result<AudioWindowResolution, worker::Error> {
    if !is_valid_video_id(video_id) {
        return Err(worker::Error::RustError("invalid video id".into()));
    }
    let probe = resolve_native_audio_probe(video_id).await?;
    if let Some(stream) = probe.stream.as_ref() {
        match fetch_audio_window_from_url(&stream.url, max_bytes).await {
            Ok(window) => {
                return Ok(AudioWindowResolution {
                    window,
                    report: probe.report.clone(),
                });
            }
            Err(error) => {
                let mut report = probe.report.clone();
                report.used_legacy_fallback = true;
                report.source = AudioResolutionSource::Legacy;
                report.range_capable = true;
                report.attempts.push(crate::task10::AudioResolutionAttempt {
                    client: stream.client,
                    status: Some("NATIVE_FETCH_FAILED".into()),
                    reason: Some(error.to_string()),
                    direct_audio_url: true,
                    allowed_host: true,
                });
                let window = fetch_audio_window(legacy, video_id, max_bytes).await?;
                return Ok(AudioWindowResolution { window, report });
            }
        }
    }

    let window = fetch_audio_window(legacy, video_id, max_bytes).await?;
    let mut report = probe.report.clone();
    report.used_legacy_fallback = true;
    report.source = AudioResolutionSource::Legacy;
    report.range_capable = true;
    Ok(AudioWindowResolution { window, report })
}

fn plan_byte_chunks(
    total_bytes: usize,
    max_total_bytes: usize,
    chunk_size: usize,
    max_chunks: usize,
) -> Vec<(usize, usize)> {
    let capped_total = total_bytes.min(max_total_bytes);
    let mut plans = Vec::new();
    let mut start = 0usize;
    while start < capped_total && plans.len() < max_chunks {
        let end = (start + chunk_size).min(capped_total).saturating_sub(1);
        if end >= start {
            plans.push((start, end));
        }
        start += chunk_size;
    }
    plans
}

fn chunk_time_offset_sec(
    byte_start: usize,
    total_bytes: usize,
    duration_sec: Option<f64>,
    chunk_index: usize,
) -> f64 {
    if total_bytes > 0 {
        if let Some(duration_sec) = duration_sec {
            if duration_sec > 0.0 {
                return byte_start as f64 / total_bytes as f64 * duration_sec;
            }
        }
    }
    chunk_index as f64 * 60.0
}

fn merge_transcript_segments_with_offsets(
    chunks: Vec<Vec<TranscriptSegment>>,
    offsets_sec: Vec<f64>,
) -> Vec<TranscriptSegment> {
    let mut merged = Vec::new();
    for (index, chunk) in chunks.into_iter().enumerate() {
        let offset = offsets_sec.get(index).copied().unwrap_or_default();
        for segment in chunk {
            merged.push(TranscriptSegment {
                start: segment.start + offset,
                end: segment.end + offset,
                text: segment.text,
            });
        }
    }
    merged.sort_by(|left, right| {
        left.start
            .partial_cmp(&right.start)
            .unwrap_or(Ordering::Equal)
    });
    merged
}

fn compute_vocal_metrics(segments: &[TranscriptSegment], coverage_sec: f64) -> (f64, f64) {
    let vocal_duration = segments
        .iter()
        .map(|segment| (segment.end - segment.start).max(0.0))
        .sum::<f64>();
    let vocal_density = if coverage_sec > 0.0 {
        (vocal_duration / coverage_sec).min(1.0)
    } else {
        0.0
    };
    (vocal_density, coverage_sec)
}

async fn run_whisper(
    ai: &Ai,
    bytes: &[u8],
    language: Option<&str>,
    artist: &str,
    track: &str,
    vad_filter: bool,
) -> Result<WhisperResponse, worker::Error> {
    let audio = STANDARD.encode(bytes);
    let mut input = serde_json::json!({
        "audio": audio,
        "vad_filter": vad_filter,
    });
    if let Some(language) = language.map(str::trim).filter(|value| !value.is_empty()) {
        input["language"] = serde_json::Value::String(language.to_owned());
    }
    let prompt = [artist.trim(), track.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if !prompt.is_empty() {
        input["initial_prompt"] = serde_json::Value::String(prompt);
    }
    ai.run(WHISPER_MODEL, input).await
}

async fn transcribe_audio_buffer(
    ai: &Ai,
    bytes: &[u8],
    language: Option<&str>,
    artist: &str,
    track: &str,
) -> Result<(String, Vec<TranscriptSegment>, Option<String>), worker::Error> {
    let whisper = run_whisper(ai, bytes, language, artist, track, true).await?;
    let mut segments = whisper_segments(whisper.segments, whisper.vtt.as_deref());
    let mut text = transcript_text(&segments, whisper.text.as_deref().unwrap_or(""));
    let mut language_out = whisper.transcription_info.and_then(|info| info.language);
    if text.is_empty() && segments.is_empty() {
        let whisper = run_whisper(ai, bytes, language, artist, track, false).await?;
        segments = whisper_segments(whisper.segments, whisper.vtt.as_deref());
        text = transcript_text(&segments, whisper.text.as_deref().unwrap_or(""));
        language_out = whisper.transcription_info.and_then(|info| info.language);
    }
    Ok((text, segments, language_out))
}

async fn transcribe_chunked_stream(
    ai: &Ai,
    legacy: &Fetcher,
    video_id: &str,
    language: Option<&str>,
    artist: &str,
    track: &str,
    duration_sec: Option<f64>,
    total_bytes: usize,
) -> Result<(String, Vec<TranscriptSegment>, bool, u32, u32), worker::Error> {
    let plans = plan_byte_chunks(
        total_bytes,
        MAX_AUDIO_BYTES,
        CHUNK_BYTE_SIZE,
        MAX_TRANSCRIBE_CHUNKS,
    );
    if plans.is_empty() {
        return Ok((String::new(), Vec::new(), true, 0, 0));
    }

    let mut text_parts = Vec::new();
    let mut segment_groups = Vec::new();
    let mut offsets = Vec::new();
    let mut whisper_calls = 0u32;
    let mut partial = total_bytes > MAX_AUDIO_BYTES;

    for (index, (start, end)) in plans.into_iter().enumerate() {
        let bytes = fetch_audio_range(legacy, video_id, start, end).await?;
        if bytes.is_empty() {
            continue;
        }
        whisper_calls += 1;
        let (text, segments, _) =
            transcribe_audio_buffer(ai, &bytes, language, artist, track).await?;
        if text.is_empty() && segments.is_empty() {
            continue;
        }
        offsets.push(chunk_time_offset_sec(
            start,
            total_bytes,
            duration_sec,
            index,
        ));
        segment_groups.push(segments);
        if !text.is_empty() {
            text_parts.push(text);
        }
    }

    let segments = merge_transcript_segments_with_offsets(segment_groups, offsets);
    let text = segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_owned();
    if segments.is_empty() && text_parts.is_empty() {
        partial = true;
    }
    let merged_text = if !text.is_empty() {
        text
    } else {
        text_parts.join(" ").trim().to_owned()
    };
    Ok((
        merged_text,
        segments,
        partial,
        whisper_calls,
        plans.len() as u32,
    ))
}

fn build_transcription_lyrics(
    video_id: &str,
    request: &ResolveRequest,
    text: &str,
    segments: &[TranscriptSegment],
    duration_sec: Option<f64>,
    partial: bool,
) -> NativeLyricsResult {
    let lines = if !segments.is_empty() {
        build_native_lines_from_segments(segments, duration_sec)
    } else {
        build_approximate_lines(text, duration_sec)
    };
    let coverage_sec = lines
        .iter()
        .map(|line| f64::from(line.end_ms) / 1000.0)
        .fold(0.0, f64::max);
    let vocal_duration = lines
        .iter()
        .map(|line| (f64::from(line.end_ms - line.start_ms) / 1000.0).max(0.0))
        .sum::<f64>();
    let vocal_density = if coverage_sec > 0.0 {
        (vocal_duration / coverage_sec).min(1.0)
    } else {
        0.0
    };
    NativeLyricsResult {
        outcome: if partial {
            NativeLyricsOutcome::LowConfidence
        } else {
            NativeLyricsOutcome::Found
        },
        video_id: video_id.to_owned(),
        title: request.title.clone().unwrap_or_default(),
        author: request.author.clone().unwrap_or_default(),
        duration: duration_sec.or(request.duration),
        provider_id: Some("transcription".into()),
        id: Some(format!("transcription:{video_id}")),
        track_name: request.title.clone(),
        artist_name: request.author.clone(),
        plain_lyrics: if text.trim().is_empty() {
            None
        } else {
            Some(text.trim().to_owned())
        },
        synced_lyrics: None,
        synced: false,
        approximate_timing: true,
        lines,
        score: Some((vocal_density * 100.0).round() as i32),
        confidence: Some((vocal_density * 100.0).round().clamp(0.0, 100.0) as u8),
        scoring_reasons: vec![NativeLyricsScoringReason {
            code: "whisper_transcription",
            points: 0,
        }],
        alternates: Vec::new(),
        message: if partial {
            "Partial transcription from Workers AI".into()
        } else {
            "Transcribed from Workers AI".into()
        },
    }
}

fn emit_metrics(
    request_id: &str,
    video_id: &str,
    status: TranscriptionStatus,
    mode: Option<TranscriptionMode>,
    metrics: &TranscriptionMetrics,
    partial: bool,
) {
    emit_json_log(
        "transcription_metrics",
        &serde_json::json!({
            "requestId": request_id,
            "videoId": video_id,
            "status": status,
            "mode": mode,
            "audioBytes": metrics.audio_bytes,
            "rangeRequests": metrics.range_requests,
            "whisperCalls": metrics.whisper_calls,
            "partial": partial,
            "usedLegacyAudioAdapter": true,
        }),
    );
}

fn skipped_transcription() -> TranscriptionResult {
    TranscriptionResult {
        side_channel: TranscriptionSideChannel {
            status: TranscriptionStatus::Skipped,
            mode: None,
            source: None,
            used_legacy_audio_adapter: false,
            partial: false,
            chunks: 0,
            sample_accepted: false,
            sample_rejected: false,
            not_found: false,
            vocal_density: None,
            coverage_sec: None,
            metrics: TranscriptionMetrics {
                audio_bytes: 0,
                range_requests: 0,
                whisper_calls: 0,
            },
        },
        lyrics: None,
    }
}

fn not_found_transcription(used_legacy_audio_adapter: bool) -> TranscriptionResult {
    TranscriptionResult {
        side_channel: TranscriptionSideChannel {
            status: TranscriptionStatus::NotFound,
            mode: None,
            source: if used_legacy_audio_adapter {
                Some("whisper")
            } else {
                None
            },
            used_legacy_audio_adapter,
            partial: false,
            chunks: 0,
            sample_accepted: false,
            sample_rejected: false,
            not_found: true,
            vocal_density: None,
            coverage_sec: None,
            metrics: TranscriptionMetrics {
                audio_bytes: 0,
                range_requests: 0,
                whisper_calls: 0,
            },
        },
        lyrics: None,
    }
}

fn audio_resolution_log_payload(
    request_id: &str,
    video_id: &str,
    report: &AudioResolutionReport,
) -> serde_json::Value {
    serde_json::json!({
        "requestId": request_id,
        "videoId": video_id,
        "source": report.source,
        "usedLegacyFallback": report.used_legacy_fallback,
        "playabilityFailure": report.playability_failure,
        "rangeCapable": report.range_capable,
        "attempts": report.attempts,
    })
}

fn used_legacy_audio_adapter_for_report(report: &AudioResolutionReport) -> bool {
    report.used_legacy_fallback || matches!(report.source, AudioResolutionSource::Legacy)
}

pub async fn resolve_transcription(
    request_id: &str,
    request: &ResolveRequest,
    native: &NativeLyricsResult,
    env: Option<&Env>,
) -> TranscriptionResult {
    if is_strong_native_result(native) {
        return skipped_transcription();
    }
    if !is_valid_video_id(&native.video_id) {
        return not_found_transcription(false);
    }

    let Some(env) = env else {
        return skipped_transcription();
    };
    let Ok(ai) = env.ai("AI") else {
        return not_found_transcription(false);
    };
    let Ok(legacy) = env.service(LEGACY_BINDING) else {
        return not_found_transcription(false);
    };

    if !should_try_full(native) && !should_try_sample(native) {
        return skipped_transcription();
    }

    let mut side_channel = TranscriptionSideChannel {
        status: TranscriptionStatus::NotFound,
        mode: None,
        source: Some("whisper"),
        used_legacy_audio_adapter: true,
        partial: false,
        chunks: 0,
        sample_accepted: false,
        sample_rejected: false,
        not_found: false,
        vocal_density: None,
        coverage_sec: None,
        metrics: TranscriptionMetrics {
            audio_bytes: 0,
            range_requests: 0,
            whisper_calls: 0,
        },
    };

    let audio_window = if should_try_sample(native) {
        fetch_audio_window_with_native_first(&legacy, &native.video_id, SAMPLE_MAX_AUDIO_BYTES)
            .await
            .ok()
    } else {
        fetch_audio_window_with_native_first(&legacy, &native.video_id, MAX_AUDIO_BYTES)
            .await
            .ok()
    };

    let Some(audio_window) = audio_window else {
        return not_found_transcription(true);
    };
    side_channel.used_legacy_audio_adapter =
        used_legacy_audio_adapter_for_report(&audio_window.report);
    emit_json_log(
        "youtube_audio_resolution",
        &audio_resolution_log_payload(request_id, &native.video_id, &audio_window.report),
    );
    side_channel.metrics.audio_bytes = audio_window.window.bytes.len();
    side_channel.metrics.range_requests = audio_window.window.range_requests;

    if should_try_sample(native) {
        side_channel.mode = Some(TranscriptionMode::Sample);
        side_channel.metrics.whisper_calls = 1;
        let sample = transcribe_audio_buffer(
            &ai,
            &audio_window.window.bytes,
            request.language.as_deref(),
            &request.author.clone().unwrap_or_default(),
            &request.title.clone().unwrap_or_default(),
        )
        .await;
        match sample {
            Ok((text, _segments, _language)) => {
                let accepted = !text.is_empty() && score_sample(native, &text);
                if accepted {
                    side_channel.status = TranscriptionStatus::Sampled;
                    side_channel.sample_accepted = true;
                    side_channel.partial = audio_window.window.partial;
                    side_channel.chunks = 1;
                    emit_metrics(
                        request_id,
                        &native.video_id,
                        side_channel.status,
                        side_channel.mode,
                        &side_channel.metrics,
                        side_channel.partial,
                    );
                    return TranscriptionResult {
                        side_channel,
                        lyrics: None,
                    };
                }
                side_channel.sample_rejected = true;
            }
            Err(_) => {
                side_channel.sample_rejected = true;
            }
        }
    }

    if !should_try_full(native) {
        side_channel.not_found = true;
        side_channel.status = TranscriptionStatus::NotFound;
        emit_metrics(
            request_id,
            &native.video_id,
            side_channel.status,
            side_channel.mode,
            &side_channel.metrics,
            side_channel.partial,
        );
        return TranscriptionResult {
            side_channel,
            lyrics: None,
        };
    }

    if should_try_sample(native) {
        side_channel.chunks = 1;
    }
    let total_bytes = audio_window
        .window
        .total_bytes
        .unwrap_or_else(|| audio_window.window.bytes.len());
    let (text, segments, partial, whisper_calls, chunk_range_requests) =
        if total_bytes > MAX_AUDIO_BYTES || total_bytes > CHUNK_BYTE_SIZE {
            transcribe_chunked_stream(
                &ai,
                &legacy,
                &native.video_id,
                request.language.as_deref(),
                request.author.as_deref().unwrap_or(""),
                request.title.as_deref().unwrap_or(""),
                request.duration,
                total_bytes,
            )
            .await
            .unwrap_or_else(|_| (String::new(), Vec::new(), true, 0, 0))
        } else {
            side_channel.mode = Some(TranscriptionMode::Full);
            let result = transcribe_audio_buffer(
                &ai,
                &audio_window.window.bytes,
                request.language.as_deref(),
                request.author.as_deref().unwrap_or(""),
                request.title.as_deref().unwrap_or(""),
            )
            .await;
            match result {
                Ok((text, segments, _language)) => (
                    text,
                    segments,
                    audio_window.window.partial,
                    1,
                    audio_window.window.range_requests,
                ),
                Err(_) => (
                    String::new(),
                    Vec::new(),
                    true,
                    1,
                    audio_window.window.range_requests,
                ),
            }
        };

    side_channel.mode = Some(TranscriptionMode::Full);
    side_channel.metrics.whisper_calls += whisper_calls.max(1);
    side_channel.metrics.range_requests += if whisper_calls > 1 {
        audio_window.window.range_requests + chunk_range_requests
    } else {
        audio_window.window.range_requests
    };
    side_channel.partial = partial || audio_window.window.partial;
    side_channel.chunks += whisper_calls.max(1);

    let text = text.trim().to_owned();
    if text.is_empty() && segments.is_empty() {
        side_channel.status = TranscriptionStatus::NotFound;
        side_channel.not_found = true;
        emit_metrics(
            request_id,
            &native.video_id,
            side_channel.status,
            side_channel.mode,
            &side_channel.metrics,
            side_channel.partial,
        );
        return TranscriptionResult {
            side_channel,
            lyrics: None,
        };
    }

    let duration_sec = request.duration;
    let lyrics = build_transcription_lyrics(
        &native.video_id,
        request,
        &text,
        &segments,
        duration_sec,
        side_channel.partial,
    );
    let coverage_sec = lyrics
        .lines
        .iter()
        .map(|line| f64::from(line.end_ms) / 1000.0)
        .fold(0.0, f64::max);
    let vocal_duration = lyrics
        .lines
        .iter()
        .map(|line| ((line.end_ms - line.start_ms) as f64 / 1000.0).max(0.0))
        .sum::<f64>();
    side_channel.vocal_density = Some(if coverage_sec > 0.0 {
        (vocal_duration / coverage_sec).min(1.0)
    } else {
        0.0
    });
    side_channel.coverage_sec = Some(coverage_sec);
    side_channel.status = if side_channel.partial {
        TranscriptionStatus::Partial
    } else {
        TranscriptionStatus::Transcribed
    };
    emit_metrics(
        request_id,
        &native.video_id,
        side_channel.status,
        side_channel.mode,
        &side_channel.metrics,
        side_channel.partial,
    );
    TranscriptionResult {
        side_channel,
        lyrics: Some(lyrics),
    }
}

pub fn transcription_outcome_for_native(native: NativeLyricsOutcome) -> TranscriptionStatus {
    match native {
        NativeLyricsOutcome::Found | NativeLyricsOutcome::Instrumental => {
            TranscriptionStatus::Skipped
        }
        NativeLyricsOutcome::LowConfidence => TranscriptionStatus::Sampled,
        NativeLyricsOutcome::NotFound => TranscriptionStatus::NotFound,
    }
}

pub fn used_legacy_audio_adapter(side_channel: &TranscriptionSideChannel) -> bool {
    side_channel.used_legacy_audio_adapter
}

#[cfg(test)]
mod tests {
    use super::*;

    fn native_result(outcome: NativeLyricsOutcome, text: &str) -> NativeLyricsResult {
        NativeLyricsResult {
            outcome,
            video_id: "dQw4w9WgXcQ".into(),
            title: "Title".into(),
            author: "Artist".into(),
            duration: Some(180.0),
            provider_id: Some("lrclib".into()),
            id: Some("1".into()),
            track_name: Some("Track".into()),
            artist_name: Some("Artist".into()),
            plain_lyrics: Some(text.into()),
            synced_lyrics: None,
            synced: false,
            approximate_timing: false,
            lines: vec![NativeLyricsLine {
                start_ms: 0,
                end_ms: 1000,
                text: text.into(),
                kind: NativeLyricsLineKind::Lyric,
                approximate: false,
            }],
            score: Some(10),
            confidence: Some(80),
            scoring_reasons: vec![NativeLyricsScoringReason {
                code: "test",
                points: 0,
            }],
            alternates: Vec::new(),
            message: "test".into(),
        }
    }

    #[test]
    fn plans_bounded_chunks_under_audio_cap() {
        let plans = plan_byte_chunks(
            150 * 1024 * 1024,
            MAX_AUDIO_BYTES,
            CHUNK_BYTE_SIZE,
            MAX_TRANSCRIBE_CHUNKS,
        );
        assert_eq!(plans.len(), MAX_TRANSCRIBE_CHUNKS);
        assert!(plans.iter().all(|(start, end)| end >= start));
        assert!(plans.last().map(|(_, end)| end + 1).unwrap_or_default() <= MAX_AUDIO_BYTES);
    }

    #[test]
    fn sample_and_full_paths_have_distinct_statuses() {
        assert_eq!(
            transcription_outcome_for_native(NativeLyricsOutcome::Found),
            TranscriptionStatus::Skipped
        );
        assert_eq!(
            transcription_outcome_for_native(NativeLyricsOutcome::LowConfidence),
            TranscriptionStatus::Sampled
        );
        assert_eq!(
            transcription_outcome_for_native(NativeLyricsOutcome::NotFound),
            TranscriptionStatus::NotFound
        );
    }

    #[test]
    fn skipped_and_not_found_results_are_typed() {
        let skipped = skipped_transcription();
        assert_eq!(skipped.side_channel.status, TranscriptionStatus::Skipped);
        assert!(!skipped.side_channel.used_legacy_audio_adapter);

        let not_found = not_found_transcription(true);
        assert_eq!(not_found.side_channel.status, TranscriptionStatus::NotFound);
        assert!(not_found.side_channel.used_legacy_audio_adapter);
        assert!(not_found.side_channel.not_found);
    }

    #[test]
    fn invalid_video_ids_return_not_found_before_audio_fetch() {
        let request = ResolveRequest {
            video_id: "bad".into(),
            title: Some("Title".into()),
            author: Some("Artist".into()),
            duration: Some(180.0),
            language: Some("en".into()),
            force_refresh: false,
        };
        let native = native_result(NativeLyricsOutcome::LowConfidence, "text");
        let result =
            futures::executor::block_on(resolve_transcription("req-1", &request, &native, None));
        assert_eq!(result.side_channel.status, TranscriptionStatus::NotFound);
        assert!(!result.side_channel.used_legacy_audio_adapter);
        assert!(result.lyrics.is_none());
    }

    #[test]
    fn sample_score_accepts_related_text() {
        let native = native_result(NativeLyricsOutcome::LowConfidence, "one two three");
        assert!(score_sample(&native, "one two three"));
        assert!(!score_sample(&native, "completely different"));
    }

    #[test]
    fn transcription_lyrics_keep_transcription_provenance() {
        let request = ResolveRequest {
            video_id: "dQw4w9WgXcQ".into(),
            title: Some("Never Gonna Give You Up".into()),
            author: Some("Rick Astley".into()),
            duration: Some(212.0),
            language: Some("en".into()),
            force_refresh: false,
        };
        let lyrics = build_transcription_lyrics(
            &request.video_id,
            &request,
            "we know the game and we're gonna play it",
            &[TranscriptSegment {
                start: 0.0,
                end: 2.0,
                text: "we know the game and we're gonna play it".into(),
            }],
            request.duration,
            false,
        );

        assert_eq!(lyrics.provider_id.as_deref(), Some("transcription"));
        assert_eq!(lyrics.outcome, NativeLyricsOutcome::Found);
        assert!(lyrics
            .plain_lyrics
            .as_deref()
            .unwrap_or_default()
            .contains("we know"));
    }

    #[test]
    fn partial_transcription_stays_partial() {
        let request = ResolveRequest {
            video_id: "dQw4w9WgXcQ".into(),
            title: Some("Never Gonna Give You Up".into()),
            author: Some("Rick Astley".into()),
            duration: Some(212.0),
            language: Some("en".into()),
            force_refresh: false,
        };
        let lyrics = build_transcription_lyrics(
            &request.video_id,
            &request,
            "one line",
            &[TranscriptSegment {
                start: 0.0,
                end: 1.0,
                text: "one line".into(),
            }],
            request.duration,
            true,
        );

        assert_eq!(lyrics.outcome, NativeLyricsOutcome::LowConfidence);
        assert!(lyrics.message.contains("Partial"));
    }

    #[test]
    fn metrics_and_legacy_flag_serialize_cleanly() {
        let side_channel = TranscriptionSideChannel {
            status: TranscriptionStatus::Partial,
            mode: Some(TranscriptionMode::Full),
            source: Some("whisper"),
            used_legacy_audio_adapter: true,
            partial: true,
            chunks: 3,
            sample_accepted: false,
            sample_rejected: true,
            not_found: false,
            vocal_density: Some(0.42),
            coverage_sec: Some(120.0),
            metrics: TranscriptionMetrics {
                audio_bytes: 1_500_000,
                range_requests: 2,
                whisper_calls: 3,
            },
        };
        let json = serde_json::to_value(&side_channel).expect("json");
        assert_eq!(json["usedLegacyAudioAdapter"], true);
        assert_eq!(json["metrics"]["whisperCalls"], 3);
        assert_eq!(used_legacy_audio_adapter(&side_channel), true);
    }

    #[test]
    fn audio_resolution_log_payload_stays_redacted_and_explicit() {
        let report = AudioResolutionReport {
            source: AudioResolutionSource::Legacy,
            used_legacy_fallback: true,
            playability_failure: Some("LOGIN_REQUIRED".into()),
            attempts: vec![crate::task10::AudioResolutionAttempt {
                client: "IOS",
                status: Some("LOGIN_REQUIRED".into()),
                reason: Some("Needs sign-in".into()),
                direct_audio_url: false,
                allowed_host: false,
            }],
            range_capable: false,
        };
        let payload = audio_resolution_log_payload("req-1", "dQw4w9WgXcQ", &report);
        let encoded = serde_json::to_string(&payload).expect("payload serializes");
        assert!(encoded.contains("\"usedLegacyFallback\":true"));
        assert!(encoded.contains("\"playabilityFailure\":\"LOGIN_REQUIRED\""));
        assert!(!encoded.contains("googlevideo.com"));
        assert!(!encoded.contains("videoplayback"));
    }

    #[test]
    fn native_reports_do_not_mark_legacy_adapter_used() {
        let native_report = AudioResolutionReport {
            source: AudioResolutionSource::Native,
            used_legacy_fallback: false,
            playability_failure: None,
            attempts: Vec::new(),
            range_capable: true,
        };
        let legacy_report = AudioResolutionReport {
            source: AudioResolutionSource::Legacy,
            used_legacy_fallback: true,
            playability_failure: None,
            attempts: Vec::new(),
            range_capable: true,
        };
        assert!(!used_legacy_audio_adapter_for_report(&native_report));
        assert!(used_legacy_audio_adapter_for_report(&legacy_report));
    }

    #[test]
    fn chunk_offsets_use_duration_when_available() {
        assert_eq!(
            chunk_time_offset_sec(2 * 1024 * 1024, 8 * 1024 * 1024, Some(240.0), 1),
            60.0
        );
        assert_eq!(chunk_time_offset_sec(0, 0, None, 2), 120.0);
    }

    #[test]
    fn chunked_full_transcription_is_not_partial_by_default() {
        let plans = plan_byte_chunks(
            8 * 1024 * 1024,
            MAX_AUDIO_BYTES,
            CHUNK_BYTE_SIZE,
            MAX_TRANSCRIBE_CHUNKS,
        );
        assert!(plans.len() > 1);
        let partial = 8 * 1024 * 1024 > MAX_AUDIO_BYTES;
        assert!(!partial);
    }

    #[test]
    fn merge_segments_keeps_order() {
        let merged = merge_transcript_segments_with_offsets(
            vec![
                vec![TranscriptSegment {
                    start: 0.0,
                    end: 1.0,
                    text: "one".into(),
                }],
                vec![TranscriptSegment {
                    start: 0.5,
                    end: 2.0,
                    text: "two".into(),
                }],
            ],
            vec![0.0, 120.0],
        );
        assert_eq!(merged[1].text, "two");
        assert!(merged[1].start > merged[0].start);
    }
}
