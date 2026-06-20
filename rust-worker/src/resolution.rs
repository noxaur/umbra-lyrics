use std::{cell::Cell, future::Future, rc::Rc, sync::Arc, time::Duration};

use futures_util::{stream, Stream};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use worker::{Delay, Env, Headers, Method, Request, Response, ResponseBuilder, Result};

use crate::lyrics::{run_trusted_lyrics_cascade, LyricsConfig, LyricsInput, LyricsResolution};
use crate::metadata::{MetadataConfig, MetadataInput, MetadataResolution};
use crate::observability::emit_json_log;
use crate::result_cache::{
    cache_key, load_replay, replay_from_events, store_replay, KvResolutionCache,
    ResolutionCacheBackend, RESULT_CACHE_BINDING,
};

pub const PROTOCOL_VERSION: &str = "1";
const MAX_BODY_BYTES: usize = 16 * 1024;
const MAX_TEXT_LENGTH: usize = 512;
const MAX_LANGUAGE_LENGTH: usize = 64;
const MAX_DURATION_SECONDS: f64 = 86_400.0;

fn source_label_metadata(source: crate::metadata::MetadataSource) -> &'static str {
    match source {
        crate::metadata::MetadataSource::Supplied => "supplied",
        crate::metadata::MetadataSource::Oembed => "oembed",
        crate::metadata::MetadataSource::Musicbrainz => "musicbrainz",
        crate::metadata::MetadataSource::Deezer => "deezer",
    }
}

fn source_label_lyrics(source: crate::lyrics::LyricsSource) -> &'static str {
    match source {
        crate::lyrics::LyricsSource::LrclibExact => "lrclib_exact",
        crate::lyrics::LyricsSource::LrclibVariant => "lrclib_variant",
        crate::lyrics::LyricsSource::LyricsOvh => "lyrics_ovh",
        crate::lyrics::LyricsSource::Genius => "genius",
    }
}

fn trace_payload(
    request_id: &str,
    stage: &'static str,
    started_at_ms: f64,
    cache_status: Option<&'static str>,
    cache_lookup_ms: Option<u64>,
    cache_write_ms: Option<u64>,
    metadata_ms: Option<u64>,
    lyrics_ms: Option<u64>,
    metadata_resolution: Option<&MetadataResolution>,
    lyrics_resolution: Option<&LyricsResolution>,
    transcription_calls: u32,
    legacy_adapter_used: bool,
    failure_category: Option<&'static str>,
) -> Value {
    let metadata = metadata_resolution.map(|resolution| {
        json!({
            "candidateCount": resolution.candidates.len(),
            "warningCount": resolution.warnings.len(),
            "selectedSource": source_label_metadata(resolution.selected.source),
        })
    });
    let lyrics = lyrics_resolution.map(|resolution| {
        json!({
            "candidateCount": resolution.candidates.len(),
            "warningCount": resolution.warnings.len(),
            "selectedSource": resolution.candidates.first().map(|candidate| source_label_lyrics(candidate.source)),
        })
    });

    let elapsed_ms = (js_sys::Date::now() - started_at_ms).max(0.0).round() as u64;
    json!({
        "kind": "resolution_trace",
        "stage": stage,
        "requestId": request_id,
        "timingsMs": {
            "elapsed": elapsed_ms,
            "cacheLookup": cache_lookup_ms,
            "cacheWrite": cache_write_ms,
            "metadata": metadata_ms,
            "lyrics": lyrics_ms,
        },
        "cache": {
            "status": cache_status,
        },
        "metadata": metadata,
        "lyrics": lyrics,
        "transcriptionCalls": transcription_calls,
        "legacyAdapterUsed": legacy_adapter_used,
        "failureCategory": failure_category,
    })
}

fn emit_trace(payload: &Value) {
    emit_json_log("resolution_trace", payload);
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveRequest {
    pub video_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub force_refresh: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtocolError {
    pub code: &'static str,
    pub message: String,
    pub field: Option<&'static str>,
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EventEnvelope<'a> {
    protocol_version: &'static str,
    request_id: &'a str,
    timestamp: &'a str,
    data: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct Event {
    pub(crate) name: String,
    pub(crate) data: Value,
}

impl Event {
    pub(crate) fn new(name: impl Into<String>, data: Value) -> Self {
        Self {
            name: name.into(),
            data,
        }
    }
}

#[cfg(test)]
struct ResolutionStreamState {
    events: Vec<Event>,
    index: usize,
    request_id: String,
    canceled: Option<Rc<Cell<bool>>>,
}

#[cfg(test)]
impl ResolutionStreamState {
    fn new(events: Vec<Event>, request_id: String) -> Self {
        Self {
            events,
            index: 0,
            request_id,
            canceled: None,
        }
    }

    fn finish(&mut self) {
        self.canceled = None;
    }
}

#[cfg(test)]
impl Drop for ResolutionStreamState {
    fn drop(&mut self) {
        if let Some(canceled) = &self.canceled {
            canceled.set(true);
        }
    }
}

struct MetadataResolutionStreamState {
    events: Vec<Event>,
    index: usize,
    request_id: String,
    started_at_ms: f64,
    request: Option<ResolveRequest>,
    env: Option<Env>,
    cache: Option<Arc<dyn ResolutionCacheBackend>>,
    cache_key: String,
    cache_checked: bool,
    force_refresh: bool,
    resolved: bool,
    cache_status: Option<&'static str>,
    cache_lookup_ms: Option<u64>,
    cache_write_ms: Option<u64>,
    metadata_ms: Option<u64>,
    lyrics_ms: Option<u64>,
    metadata_resolution: Option<MetadataResolution>,
    lyrics_resolution: Option<LyricsResolution>,
    transcription_calls: u32,
    legacy_adapter_used: bool,
    failure_category: Option<&'static str>,
    canceled: Option<Rc<Cell<bool>>>,
}

impl MetadataResolutionStreamState {
    fn finish(&mut self) {
        self.canceled = None;
    }
}

impl Drop for MetadataResolutionStreamState {
    fn drop(&mut self) {
        if let Some(canceled) = &self.canceled {
            canceled.set(true);
        }
    }
}

pub async fn resolve(mut request: Request, request_id: &str, env: Env) -> Result<Response> {
    if request.method() != Method::Post {
        return terminal_error(
            request_id,
            ProtocolError {
                code: "method_not_allowed",
                message: "endpoint requires POST".into(),
                field: None,
                retryable: false,
            },
        );
    }

    let content_type = request
        .headers()
        .get("Content-Type")?
        .unwrap_or_default()
        .to_ascii_lowercase();
    if content_type
        .split(';')
        .next()
        .is_none_or(|value| value.trim() != "application/json")
    {
        return terminal_error(
            request_id,
            ProtocolError {
                code: "invalid_content_type",
                message: "Content-Type must be application/json".into(),
                field: None,
                retryable: false,
            },
        );
    }

    if request
        .headers()
        .get("Content-Length")?
        .and_then(|value| value.parse::<usize>().ok())
        .is_some_and(|length| length > MAX_BODY_BYTES)
    {
        return terminal_error(
            request_id,
            ProtocolError {
                code: "body_too_large",
                message: "request body exceeds 16384 bytes".into(),
                field: None,
                retryable: false,
            },
        );
    }

    let bytes = match request.bytes().await {
        Ok(bytes) => bytes,
        Err(_) => {
            return terminal_error(
                request_id,
                ProtocolError {
                    code: "internal_error",
                    message: "failed to read request body".into(),
                    field: None,
                    retryable: true,
                },
            )
        }
    };
    if bytes.len() > MAX_BODY_BYTES {
        return terminal_error(
            request_id,
            ProtocolError {
                code: "body_too_large",
                message: "request body exceeds 16384 bytes".into(),
                field: None,
                retryable: false,
            },
        );
    }

    let value = match serde_json::from_slice::<Value>(&bytes) {
        Ok(value) => value,
        Err(_) => {
            return terminal_error(
                request_id,
                ProtocolError {
                    code: "invalid_json",
                    message: "body must be a valid resolution request JSON object".into(),
                    field: None,
                    retryable: false,
                },
            )
        }
    };
    let parsed = match serde_json::from_value::<ResolveRequest>(value) {
        Ok(parsed) => parsed,
        Err(_) => {
            return terminal_error(
                request_id,
                ProtocolError {
                    code: "invalid_request",
                    message: "body does not match the resolution request schema".into(),
                    field: None,
                    retryable: false,
                },
            )
        }
    };

    let normalized = match normalize_request(parsed) {
        Ok(normalized) => normalized,
        Err(error) => return terminal_error(request_id, error),
    };

    let cache_key_value = cache_key(&normalized.video_id);
    let force_refresh = normalized.force_refresh;
    let cache = env
        .kv(RESULT_CACHE_BINDING)
        .ok()
        .map(|store| Arc::new(KvResolutionCache::new(store)) as Arc<dyn ResolutionCacheBackend>);
    let started_at_ms = js_sys::Date::now();
    let accepted_trace = trace_payload(
        request_id,
        "accepted",
        started_at_ms,
        cache.as_ref().map(|_| "pending"),
        None,
        None,
        None,
        None,
        None,
        None,
        0,
        false,
        None,
    );
    emit_trace(&accepted_trace);
    let state = MetadataResolutionStreamState {
        events: vec![
            Event::new(
                "phase",
                json!({"phase": "accepted", "message": "Resolution request accepted"}),
            ),
            Event::new("trace", accepted_trace),
        ],
        index: 0,
        request_id: request_id.to_owned(),
        started_at_ms,
        request: Some(normalized),
        env: Some(env),
        cache,
        cache_key: cache_key_value,
        cache_checked: false,
        force_refresh,
        resolved: false,
        cache_status: Some("pending"),
        cache_lookup_ms: None,
        cache_write_ms: None,
        metadata_ms: None,
        lyrics_ms: None,
        metadata_resolution: None,
        lyrics_resolution: None,
        transcription_calls: 0,
        legacy_adapter_used: false,
        failure_category: None,
        canceled: None,
    };
    let event_stream = metadata_resolution_event_stream(
        state,
        || Delay::from(Duration::from_millis(20)),
        timestamp,
    );

    sse_response(
        ResponseBuilder::new().from_stream(event_stream)?,
        request_id,
    )
}

#[cfg(test)]
fn resolution_event_stream<DelayFactory, DelayFuture, Timestamp>(
    state: ResolutionStreamState,
    delay: DelayFactory,
    now: Timestamp,
) -> impl Stream<Item = Result<Vec<u8>>>
where
    DelayFactory: Fn() -> DelayFuture + Clone,
    DelayFuture: Future<Output = ()>,
    Timestamp: Fn() -> String + Clone,
{
    stream::unfold(state, move |mut state| {
        let delay = delay.clone();
        let now = now.clone();
        async move {
            if state.index >= state.events.len() {
                state.finish();
                return None;
            }
            if state.index > 0 {
                delay().await;
            }
            let chunk = encode_event(&state.events[state.index], &state.request_id, &now());
            state.index += 1;
            Some((chunk.map(String::into_bytes), state))
        }
    })
}

fn metadata_resolution_event_stream<DelayFactory, DelayFuture, Timestamp>(
    state: MetadataResolutionStreamState,
    delay: DelayFactory,
    now: Timestamp,
) -> impl Stream<Item = Result<Vec<u8>>>
where
    DelayFactory: Fn() -> DelayFuture + Clone,
    DelayFuture: Future<Output = ()>,
    Timestamp: Fn() -> String + Clone,
{
    stream::unfold(state, move |mut state| {
        let delay = delay.clone();
        let now = now.clone();
        async move {
            if state.index >= state.events.len() && !state.resolved {
                if !state.cache_checked {
                    state.cache_checked = true;
                    if !state.force_refresh {
                        let cache = state.cache.as_ref().cloned();
                        let video_id = state
                            .request
                            .as_ref()
                            .map(|request| request.video_id.clone());
                        if let (Some(cache), Some(video_id)) = (cache, video_id) {
                            let cache_started = js_sys::Date::now();
                            if let Some(replay) =
                                load_replay(cache.as_ref(), &state.cache_key, &video_id).await
                            {
                                state.cache_status = Some("hit");
                                state.cache_lookup_ms =
                                    Some((js_sys::Date::now() - cache_started).max(0.0).round()
                                        as u64);
                                let trace = trace_payload(
                                    &state.request_id,
                                    "cache",
                                    state.started_at_ms,
                                    state.cache_status,
                                    state.cache_lookup_ms,
                                    state.cache_write_ms,
                                    state.metadata_ms,
                                    state.lyrics_ms,
                                    state.metadata_resolution.as_ref(),
                                    state.lyrics_resolution.as_ref(),
                                    state.transcription_calls,
                                    state.legacy_adapter_used,
                                    state.failure_category,
                                );
                                emit_trace(&trace);
                                state.events.push(Event::new("trace", trace));
                                state.events.extend(replay.events);
                                state.resolved = true;
                            } else {
                                state.cache_status = Some("miss");
                                state.cache_lookup_ms =
                                    Some((js_sys::Date::now() - cache_started).max(0.0).round()
                                        as u64);
                                let trace = trace_payload(
                                    &state.request_id,
                                    "cache",
                                    state.started_at_ms,
                                    state.cache_status,
                                    state.cache_lookup_ms,
                                    state.cache_write_ms,
                                    state.metadata_ms,
                                    state.lyrics_ms,
                                    state.metadata_resolution.as_ref(),
                                    state.lyrics_resolution.as_ref(),
                                    state.transcription_calls,
                                    state.legacy_adapter_used,
                                    state.failure_category,
                                );
                                emit_trace(&trace);
                                state.events.push(Event::new("trace", trace));
                            }
                        }
                    }
                }
                if state.index >= state.events.len() && !state.resolved {
                    let request = state
                        .request
                        .take()
                        .expect("metadata request exists until resolution");
                    let env = state
                        .env
                        .take()
                        .expect("Worker environment exists until resolution");
                    let input = MetadataInput {
                        video_id: request.video_id.clone(),
                        title: request.title.clone(),
                        author: request.author.clone(),
                        duration: request.duration,
                    };
                    let config = MetadataConfig::from_env(&env);
                    let metadata_started = js_sys::Date::now();
                    let resolution = crate::metadata::resolve_metadata(&input, &config).await;
                    state.metadata_resolution = Some(resolution.clone());
                    state.metadata_ms =
                        Some((js_sys::Date::now() - metadata_started).max(0.0).round() as u64);
                    let mut live_events = metadata_events(&request, &resolution);
                    let lyrics_input = LyricsInput {
                        artist: resolution.selected.artist.clone(),
                        track: resolution.selected.track.clone(),
                        duration: resolution.selected.duration.or(request.duration),
                    };
                    let lyrics_started = js_sys::Date::now();
                    let lyrics_resolution =
                        run_trusted_lyrics_cascade(&lyrics_input, &LyricsConfig::default()).await;
                    state.lyrics_resolution = Some(lyrics_resolution.clone());
                    state.lyrics_ms =
                        Some((js_sys::Date::now() - lyrics_started).max(0.0).round() as u64);
                    state.transcription_calls = 0;
                    let trace = trace_payload(
                        &state.request_id,
                        "resolution",
                        state.started_at_ms,
                        state.cache_status,
                        state.cache_lookup_ms,
                        state.cache_write_ms,
                        state.metadata_ms,
                        state.lyrics_ms,
                        state.metadata_resolution.as_ref(),
                        state.lyrics_resolution.as_ref(),
                        state.transcription_calls,
                        state.legacy_adapter_used,
                        None,
                    );
                    emit_trace(&trace);
                    state.events.push(Event::new("trace", trace));
                    live_events.extend(lyrics_events(&lyrics_resolution));
                    live_events.extend(terminal_placeholder_events(&request, &resolution));
                    if let Some(cache) = state.cache.as_ref().cloned() {
                        if let Some(replay) =
                            replay_from_events(&request.video_id, live_events.clone())
                        {
                            let cache_store_started = js_sys::Date::now();
                            let _ = store_replay(
                                cache.as_ref(),
                                &state.cache_key,
                                &replay,
                                state.force_refresh,
                            )
                            .await;
                            state.cache_write_ms =
                                Some((js_sys::Date::now() - cache_store_started).max(0.0).round()
                                    as u64);
                        }
                    }
                    state.events.extend(live_events);
                    state.resolved = true;
                }
            }
            if state.index >= state.events.len() {
                state.finish();
                return None;
            }
            if state.index > 0 {
                delay().await;
            }
            let chunk = encode_event(&state.events[state.index], &state.request_id, &now());
            state.index += 1;
            Some((chunk.map(String::into_bytes), state))
        }
    })
}

pub fn normalize_request(
    mut request: ResolveRequest,
) -> std::result::Result<ResolveRequest, ProtocolError> {
    if !is_video_id(&request.video_id) {
        return Err(ProtocolError {
            code: "invalid_request",
            message: "videoId must be an 11-character YouTube video ID".into(),
            field: Some("videoId"),
            retryable: false,
        });
    }

    request.title = normalize_optional_text(request.title, "title", MAX_TEXT_LENGTH, true)?;
    request.author = normalize_optional_text(request.author, "author", MAX_TEXT_LENGTH, true)?;

    if request
        .duration
        .is_some_and(|value| !value.is_finite() || !(0.0..=MAX_DURATION_SECONDS).contains(&value))
    {
        return Err(ProtocolError {
            code: "invalid_request",
            message: "duration must be finite seconds between 0 and 86400".into(),
            field: Some("duration"),
            retryable: false,
        });
    }

    request.language =
        normalize_optional_text(request.language, "language", MAX_LANGUAGE_LENGTH, false)?;
    if request
        .language
        .as_deref()
        .is_some_and(|value| !is_language_tag(value))
    {
        return Err(ProtocolError {
            code: "invalid_request",
            message: "language must be a valid language tag".into(),
            field: Some("language"),
            retryable: false,
        });
    }

    Ok(request)
}

fn normalize_optional_text(
    value: Option<String>,
    field: &'static str,
    max_length: usize,
    allow_empty: bool,
) -> std::result::Result<Option<String>, ProtocolError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_owned();
    if (!allow_empty && value.is_empty()) || value.chars().count() > max_length {
        return Err(ProtocolError {
            code: "invalid_request",
            message: if allow_empty {
                format!("{field} must be at most {max_length} characters")
            } else {
                format!("{field} must be non-empty and at most {max_length} characters")
            },
            field: Some(field),
            retryable: false,
        });
    }
    Ok(Some(value))
}

fn is_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn is_language_tag(value: &str) -> bool {
    let mut parts = value.split('-');
    let Some(primary) = parts.next() else {
        return false;
    };
    (2..=8).contains(&primary.len())
        && primary.bytes().all(|byte| byte.is_ascii_alphabetic())
        && parts.all(|part| {
            (1..=8).contains(&part.len()) && part.bytes().all(|byte| byte.is_ascii_alphanumeric())
        })
}

fn metadata_events(request: &ResolveRequest, resolution: &MetadataResolution) -> Vec<Event> {
    let mut events = resolution
        .candidates
        .iter()
        .map(|candidate| {
            Event::new(
                "candidate",
                json!({
                    "kind": "metadata",
                    "artist": candidate.artist,
                    "track": candidate.track,
                    "duration": candidate.duration,
                    "source": candidate.source,
                    "sourceId": candidate.source_id,
                    "stableIds": candidate.stable_ids,
                    "score": candidate.score,
                    "scoringReasons": candidate.scoring_reasons,
                    "selected": candidate == &resolution.selected,
                }),
            )
        })
        .collect::<Vec<_>>();
    events.extend(resolution.warnings.iter().map(|warning| {
        Event::new(
            "warning",
            json!({
                "code": warning.code,
                "source": warning.source,
                "message": warning.message,
                "retryable": warning.retryable,
            }),
        )
    }));

    let metadata = json!({
        "kind": "canonical",
        "videoId": request.video_id,
        "title": resolution.selected.track,
        "author": resolution.selected.artist,
        "duration": resolution.selected.duration.or(request.duration),
        "source": resolution.selected.source,
        "score": resolution.selected.score,
        "scoringReasons": resolution.selected.scoring_reasons,
        "stableIds": resolution.selected.stable_ids,
        "canonical": resolution.selected,
        "alternates": resolution.candidates.iter().skip(1).collect::<Vec<_>>(),
        "language": request.language,
    });
    events.extend([
        Event::new("metadata", metadata),
        Event::new(
            "phase",
            json!({"phase": "resolving", "message": "Canonical metadata resolved"}),
        ),
    ]);
    events
}

fn lyrics_events(resolution: &LyricsResolution) -> Vec<Event> {
    let mut events = resolution
        .candidates
        .iter()
        .map(|candidate| {
            Event::new(
                "candidate",
                json!({
                    "kind": "lyrics",
                    "source": candidate.source,
                    "sourceId": candidate.source_id,
                    "artist": candidate.artist,
                    "track": candidate.track,
                    "duration": candidate.duration,
                    "plainLyrics": candidate.plain_lyrics,
                    "syncedLyrics": candidate.synced_lyrics,
                    "synced": candidate.synced,
                    "diagnostics": candidate.diagnostics,
                }),
            )
        })
        .collect::<Vec<_>>();

    events.extend(resolution.warnings.iter().map(|warning| {
        Event::new(
            "warning",
            json!({
                "code": warning.diagnostic.code,
                "source": warning.source,
                "message": warning.diagnostic.message,
                "retryable": warning.diagnostic.retryable,
            }),
        )
    }));

    events
}

fn terminal_placeholder_events(
    request: &ResolveRequest,
    resolution: &MetadataResolution,
) -> Vec<Event> {
    let metadata = json!({
        "kind": "canonical",
        "videoId": request.video_id,
        "title": resolution.selected.track,
        "author": resolution.selected.artist,
        "duration": resolution.selected.duration.or(request.duration),
        "source": resolution.selected.source,
        "score": resolution.selected.score,
        "scoringReasons": resolution.selected.scoring_reasons,
        "stableIds": resolution.selected.stable_ids,
        "canonical": resolution.selected,
        "alternates": resolution.candidates.iter().skip(1).collect::<Vec<_>>(),
        "language": request.language,
    });

    vec![
        Event::new(
            "warning",
            json!({
                "code": "placeholder_resolution",
                "message": "Lyrics provider resolution is not implemented yet"
            }),
        ),
        Event::new(
            "result",
            json!({
                "outcome": "not_found",
                "resolution": "placeholder",
                "videoId": request.video_id,
                "metadata": metadata,
                "lyrics": Value::Null,
            }),
        ),
    ]
}

fn terminal_error(request_id: &str, error: ProtocolError) -> Result<Response> {
    let started_at_ms = js_sys::Date::now();
    let trace = trace_payload(
        request_id,
        "terminal_error",
        started_at_ms,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        0,
        false,
        Some(error.code),
    );
    emit_trace(&trace);
    let event = Event::new(
        "error",
        json!({
            "code": error.code,
            "message": error.message,
            "field": error.field,
            "retryable": error.retryable,
        }),
    );
    let body = encode_event(&event, request_id, &timestamp())?;
    sse_response(Response::from_bytes(body.into_bytes())?, request_id)
}

fn encode_event(event: &Event, request_id: &str, timestamp: &str) -> Result<String> {
    let envelope = EventEnvelope {
        protocol_version: PROTOCOL_VERSION,
        request_id,
        timestamp,
        data: event.data.clone(),
    };
    Ok(format!(
        "event: {}\ndata: {}\n\n",
        event.name,
        serde_json::to_string(&envelope)?
    ))
}

fn timestamp() -> String {
    js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".into())
}

fn sse_response(response: Response, request_id: &str) -> Result<Response> {
    let headers = Headers::new();
    headers.set("Content-Type", "text/event-stream; charset=utf-8")?;
    headers.set("Cache-Control", "no-cache, no-transform")?;
    headers.set("X-Accel-Buffering", "no")?;
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set("X-Umbra-Request-Id", request_id)?;
    headers.set("X-Umbra-Origin", "rust")?;
    Ok(response.with_headers(headers))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::result_cache::{CacheOutcomeClass, CachedResolutionReplay, ResolutionCacheBackend};
    use std::{
        collections::HashMap,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Mutex,
        },
    };

    fn valid_request() -> ResolveRequest {
        ResolveRequest {
            video_id: "dQw4w9WgXcQ".into(),
            title: Some("  Never Gonna Give You Up  ".into()),
            author: Some(" Rick Astley ".into()),
            duration: Some(212.4),
            language: Some("en-US".into()),
            force_refresh: false,
        }
    }

    fn supplied_metadata_resolution(request: &ResolveRequest) -> MetadataResolution {
        let input = MetadataInput {
            video_id: request.video_id.clone(),
            title: request.title.clone(),
            author: request.author.clone(),
            duration: request.duration,
        };
        crate::metadata::rank_metadata(
            &input,
            vec![crate::metadata::MetadataCandidate {
                artist: request.author.clone().unwrap_or_default(),
                track: request.title.clone().unwrap_or_default(),
                duration: request.duration,
                source: crate::metadata::MetadataSource::Supplied,
                source_id: None,
                stable_ids: crate::metadata::StableIds {
                    youtube_video_id: Some(request.video_id.clone()),
                    ..crate::metadata::StableIds::default()
                },
                score: 0,
                scoring_reasons: vec![],
            }],
        )
    }

    #[derive(Default)]
    struct MockCache {
        replay: Mutex<HashMap<String, CachedResolutionReplay>>,
        reads: AtomicUsize,
        writes: AtomicUsize,
    }

    impl MockCache {
        fn reads(&self) -> usize {
            self.reads.load(Ordering::SeqCst)
        }

        fn writes(&self) -> usize {
            self.writes.load(Ordering::SeqCst)
        }
    }

    impl ResolutionCacheBackend for MockCache {
        fn get<'a>(
            &'a self,
            key: &'a str,
        ) -> futures::future::BoxFuture<'a, Option<CachedResolutionReplay>> {
            Box::pin(async move {
                self.reads.fetch_add(1, Ordering::SeqCst);
                self.replay.lock().expect("cache").get(key).cloned()
            })
        }

        fn put<'a>(
            &'a self,
            key: &'a str,
            replay: &'a CachedResolutionReplay,
            _ttl_secs: u64,
        ) -> futures::future::BoxFuture<'a, ()> {
            Box::pin(async move {
                self.writes.fetch_add(1, Ordering::SeqCst);
                self.replay
                    .lock()
                    .expect("cache")
                    .insert(key.to_owned(), replay.clone());
            })
        }
    }

    #[test]
    fn normalizes_valid_request() {
        let normalized = normalize_request(valid_request()).expect("valid request");
        assert_eq!(normalized.video_id, "dQw4w9WgXcQ");
        assert_eq!(normalized.title.as_deref(), Some("Never Gonna Give You Up"));
        assert_eq!(normalized.author.as_deref(), Some("Rick Astley"));
    }

    #[test]
    fn follows_exact_video_id_and_optional_text_contracts() {
        let mut request = valid_request();
        request.video_id = " dQw4w9WgXcQ ".into();
        assert_eq!(
            normalize_request(request)
                .expect_err("surrounding whitespace is invalid")
                .field,
            Some("videoId")
        );

        let mut request = valid_request();
        request.title = Some("   ".into());
        request.author = Some(String::new());
        let normalized = normalize_request(request).expect("empty optional text is allowed");
        assert_eq!(normalized.title.as_deref(), Some(""));
        assert_eq!(normalized.author.as_deref(), Some(""));
    }

    #[test]
    fn dropping_stream_during_pending_delay_marks_cancellation() {
        use std::task::{Context, Poll};

        use futures_util::{future, pin_mut, task::noop_waker_ref};

        let canceled = Rc::new(Cell::new(false));
        let events = vec![
            Event::new("phase", json!({"phase": "accepted"})),
            Event::new("result", json!({"outcome": "not_found"})),
        ];
        let mut state = ResolutionStreamState::new(events, "request-123".into());
        state.canceled = Some(canceled.clone());
        {
            let event_stream = resolution_event_stream(state, future::pending, || {
                "2026-06-19T12:00:00.000Z".into()
            });
            pin_mut!(event_stream);
            let mut context = Context::from_waker(noop_waker_ref());
            assert!(matches!(
                Stream::poll_next(event_stream.as_mut(), &mut context),
                Poll::Ready(Some(Ok(_)))
            ));
            assert!(matches!(
                Stream::poll_next(event_stream.as_mut(), &mut context),
                Poll::Pending
            ));
        }
        assert!(
            canceled.get(),
            "dropping pending stream must cancel its state"
        );
    }

    #[test]
    fn rejects_invalid_fields() {
        let mut request = valid_request();
        request.video_id = "short".into();
        assert_eq!(
            normalize_request(request)
                .expect_err("invalid video ID")
                .field,
            Some("videoId")
        );

        let mut request = valid_request();
        request.duration = Some(f64::INFINITY);
        assert_eq!(
            normalize_request(request)
                .expect_err("invalid duration")
                .field,
            Some("duration")
        );

        let mut request = valid_request();
        request.language = Some("e_".into());
        assert_eq!(
            normalize_request(request)
                .expect_err("invalid language")
                .field,
            Some("language")
        );
    }

    #[test]
    fn encodes_all_owned_event_names_with_common_envelope() {
        for name in [
            "phase",
            "metadata",
            "candidate",
            "warning",
            "result",
            "error",
        ] {
            let encoded = encode_event(
                &Event::new(name, json!({"marker": name})),
                "request-123",
                "2026-06-19T12:00:00.000Z",
            )
            .expect("event encodes");
            assert!(encoded.starts_with(&format!("event: {name}\ndata: ")));
            assert!(encoded.contains("\"protocolVersion\":\"1\""));
            assert!(encoded.contains("\"requestId\":\"request-123\""));
            assert!(encoded.contains("\"timestamp\":\"2026-06-19T12:00:00.000Z\""));
            assert!(encoded.ends_with("\n\n"));
        }
    }

    #[test]
    fn placeholder_result_is_deterministic() {
        let request = normalize_request(valid_request()).expect("valid request");
        let resolution = supplied_metadata_resolution(&request);
        let first = terminal_placeholder_events(&request, &resolution);
        let second = terminal_placeholder_events(&request, &resolution);
        assert_eq!(first.last().expect("result").name, "result");
        assert_eq!(
            first.last().expect("result").data,
            second.last().expect("result").data
        );
        assert_eq!(
            first.last().expect("result").data["resolution"],
            "placeholder"
        );
        assert_eq!(first.last().expect("result").data["outcome"], "not_found");
    }

    #[test]
    fn metadata_events_expose_candidates_sources_and_scoring_reasons() {
        let request = normalize_request(valid_request()).expect("valid request");
        let resolution = supplied_metadata_resolution(&request);
        let events = metadata_events(&request, &resolution);
        let candidate = events
            .iter()
            .find(|event| event.name == "candidate")
            .expect("candidate event");
        assert_eq!(candidate.data["kind"], "metadata");
        assert_eq!(candidate.data["source"], "supplied");
        assert!(candidate.data["scoringReasons"].is_array());
        assert_eq!(candidate.data["selected"], true);
    }

    #[test]
    fn metadata_events_emit_candidates_before_source_warnings() {
        let request = normalize_request(valid_request()).expect("valid request");
        let mut resolution = supplied_metadata_resolution(&request);
        resolution.warnings.push(crate::metadata::SourceWarning {
            source: crate::metadata::MetadataSource::Deezer,
            code: "source_timeout",
            message: "Deezer timed out".into(),
            retryable: true,
        });
        let events = metadata_events(&request, &resolution);
        let candidate_index = events
            .iter()
            .position(|event| event.name == "candidate")
            .expect("candidate");
        let source_warning_index = events
            .iter()
            .position(|event| event.name == "warning" && event.data.get("source").is_some())
            .expect("source warning");
        let metadata_index = events
            .iter()
            .position(|event| event.name == "metadata")
            .expect("metadata");
        assert!(candidate_index < source_warning_index);
        assert!(source_warning_index < metadata_index);
    }

    #[test]
    fn cache_hit_still_streams_progress_and_result_events() {
        use futures_util::{future, pin_mut, task::noop_waker_ref, Stream};

        let request = normalize_request(valid_request()).expect("valid request");
        let video_id = request.video_id.clone();
        let cache = Arc::new(MockCache::default());
        let cache_key = crate::result_cache::cache_key(&video_id);
        cache.replay.lock().expect("cache").insert(
            cache_key.clone(),
            CachedResolutionReplay {
                schema_version: crate::result_cache::CACHE_SCHEMA_VERSION,
                pipeline_version: crate::result_cache::CACHE_PIPELINE_VERSION.to_owned(),
                video_id: video_id.clone(),
                outcome_class: CacheOutcomeClass::Negative,
                events: vec![
                    Event::new(
                        "metadata",
                        json!({
                            "kind": "canonical",
                            "videoId": video_id.clone(),
                            "title": "Never Gonna Give You Up",
                            "author": "Rick Astley"
                        }),
                    ),
                    Event::new(
                        "phase",
                        json!({"phase": "resolving", "message": "Canonical metadata resolved"}),
                    ),
                    Event::new(
                        "warning",
                        json!({
                            "code": "placeholder_resolution",
                            "message": "Lyrics provider resolution is not implemented yet"
                        }),
                    ),
                    Event::new(
                        "result",
                        json!({
                            "outcome": "not_found",
                            "resolution": "placeholder",
                            "videoId": video_id.clone(),
                            "metadata": {
                                "title": "Never Gonna Give You Up",
                                "author": "Rick Astley",
                                "duration": 212.4,
                                "language": "en"
                            },
                            "lyrics": Value::Null,
                        }),
                    ),
                ],
            },
        );

        let state = MetadataResolutionStreamState {
            events: vec![Event::new(
                "phase",
                json!({"phase": "accepted", "message": "Resolution request accepted"}),
            )],
            index: 0,
            request_id: "request-123".into(),
            request: Some(request),
            env: None,
            cache: Some(cache.clone()),
            cache_key,
            cache_checked: false,
            force_refresh: false,
            resolved: false,
            canceled: None,
        };
        let stream = metadata_resolution_event_stream(
            state,
            || future::ready(()),
            || "2026-06-19T12:00:00.000Z".into(),
        );
        pin_mut!(stream);
        let mut context = std::task::Context::from_waker(noop_waker_ref());

        let first = match Stream::poll_next(stream.as_mut(), &mut context) {
            std::task::Poll::Ready(Some(Ok(chunk))) => chunk,
            other => panic!("expected first chunk, got {other:?}"),
        };
        let first_text = String::from_utf8(first).expect("utf8");
        assert!(first_text.contains("event: phase"));
        assert!(!first_text.contains("event: metadata"));

        let mut remaining = String::new();
        loop {
            match Stream::poll_next(stream.as_mut(), &mut context) {
                std::task::Poll::Ready(Some(Ok(chunk))) => {
                    remaining.push_str(&String::from_utf8(chunk).expect("utf8"));
                }
                std::task::Poll::Ready(None) => break,
                std::task::Poll::Pending => continue,
                std::task::Poll::Ready(Some(Err(error))) => panic!("stream error: {error:?}"),
            }
        }

        assert!(remaining.contains("event: metadata"));
        assert!(remaining.contains("event: warning"));
        assert!(remaining.contains("event: result"));
        assert_eq!(cache.reads(), 1);
        assert_eq!(cache.writes(), 0);
    }

    #[test]
    fn lyrics_events_expose_shared_candidate_model() {
        let events = lyrics_events(&crate::lyrics::LyricsResolution {
            candidates: vec![crate::lyrics::LyricsCandidate {
                source: crate::lyrics::LyricsSource::Genius,
                source_id: Some("7".into()),
                artist: "Queen".into(),
                track: "Don't Stop Me Now".into(),
                duration: Some(210.0),
                plain_lyrics: "Tonight I'm gonna have myself a real good time".into(),
                synced_lyrics: None,
                synced: false,
                diagnostics: vec![crate::lyrics::LyricsDiagnostic {
                    code: "genius",
                    message: "Genius page lyrics".into(),
                    retryable: false,
                }],
            }],
            warnings: vec![crate::lyrics::LyricsSourceFailure::transport(
                crate::lyrics::LyricsSource::LyricsOvh,
                "lyrics.ovh unavailable",
            )],
        });

        let candidate = events
            .iter()
            .find(|event| event.name == "candidate")
            .expect("lyrics candidate");
        assert_eq!(candidate.data["kind"], "lyrics");
        assert_eq!(candidate.data["source"], "genius");
        assert_eq!(candidate.data["artist"], "Queen");
        assert_eq!(candidate.data["track"], "Don't Stop Me Now");
        assert_eq!(candidate.data["synced"], false);
        assert!(candidate.data["diagnostics"].is_array());
        let warning = events
            .iter()
            .find(|event| event.name == "warning" && event.data.get("source").is_some())
            .expect("lyrics warning");
        assert_eq!(warning.data["source"], "lyrics_ovh");
        assert_eq!(warning.data["code"], "source_unavailable");
    }

    #[test]
    fn trace_payload_excludes_lyrics_text_and_audio_urls() {
        let request = normalize_request(valid_request()).expect("valid request");
        let metadata = supplied_metadata_resolution(&request);
        let lyrics = crate::lyrics::LyricsResolution {
            candidates: vec![crate::lyrics::LyricsCandidate {
                source: crate::lyrics::LyricsSource::LrclibExact,
                source_id: Some("42".into()),
                artist: "Rick Astley".into(),
                track: "Never Gonna Give You Up".into(),
                duration: Some(212.4),
                plain_lyrics: "never gonna give you up".into(),
                synced_lyrics: Some("[00:01.00] never gonna give you up".into()),
                synced: true,
                diagnostics: vec![],
            }],
            warnings: vec![],
        };
        let trace = trace_payload(
            "request-123",
            "resolution",
            js_sys::Date::now(),
            Some("miss"),
            Some(12),
            Some(4),
            Some(9),
            Some(8),
            Some(&metadata),
            Some(&lyrics),
            0,
            false,
            None,
        );
        let encoded = serde_json::to_string(&trace).expect("trace encodes");
        assert!(!encoded.contains("plainLyrics"));
        assert!(!encoded.contains("syncedLyrics"));
        assert!(!encoded.contains("audioUrl"));
        assert!(encoded.contains("\"selectedSource\":\"supplied\""));
    }
}
