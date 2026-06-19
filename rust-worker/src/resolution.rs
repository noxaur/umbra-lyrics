use std::{cell::Cell, future::Future, rc::Rc, time::Duration};

use futures_util::{stream, Stream};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use worker::{Delay, Headers, Method, Request, Response, ResponseBuilder, Result};

pub const PROTOCOL_VERSION: &str = "1";
const MAX_BODY_BYTES: usize = 16 * 1024;
const MAX_TEXT_LENGTH: usize = 512;
const MAX_LANGUAGE_LENGTH: usize = 64;
const MAX_DURATION_SECONDS: f64 = 86_400.0;

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

#[derive(Debug, Clone)]
struct Event {
    name: &'static str,
    data: Value,
}

impl Event {
    fn new(name: &'static str, data: Value) -> Self {
        Self { name, data }
    }
}

struct ResolutionStreamState {
    events: Vec<Event>,
    index: usize,
    request_id: String,
    canceled: Option<Rc<Cell<bool>>>,
}

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

impl Drop for ResolutionStreamState {
    fn drop(&mut self) {
        if let Some(canceled) = &self.canceled {
            canceled.set(true);
        }
    }
}

pub async fn resolve(mut request: Request, request_id: &str) -> Result<Response> {
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

    let state = ResolutionStreamState::new(success_events(&normalized), request_id.to_owned());
    let event_stream =
        resolution_event_stream(state, || Delay::from(Duration::from_millis(20)), timestamp);

    sse_response(
        ResponseBuilder::new().from_stream(event_stream)?,
        request_id,
    )
}

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

fn success_events(request: &ResolveRequest) -> Vec<Event> {
    let metadata = json!({
        "videoId": request.video_id,
        "title": request.title,
        "author": request.author,
        "duration": request.duration,
        "language": request.language,
    });

    vec![
        Event::new(
            "phase",
            json!({"phase": "accepted", "message": "Resolution request accepted"}),
        ),
        Event::new("metadata", metadata.clone()),
        Event::new(
            "phase",
            json!({"phase": "resolving", "message": "Preparing prototype resolution"}),
        ),
        Event::new(
            "warning",
            json!({
                "code": "placeholder_resolution",
                "message": "Intelligent Rust resolution is not implemented yet"
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
        let first = success_events(&request);
        let second = success_events(&request);
        assert_eq!(first.len(), 5);
        assert_eq!(first[4].name, "result");
        assert_eq!(first[4].data, second[4].data);
        assert_eq!(first[4].data["resolution"], "placeholder");
        assert_eq!(first[4].data["outcome"], "not_found");
    }
}
