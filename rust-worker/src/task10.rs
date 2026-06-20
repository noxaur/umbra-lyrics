use std::time::Duration;

use futures_util::{
    future::{select, Either},
    pin_mut,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::{form_urlencoded, Url};
use worker::{AbortController, Delay, Fetch, Headers, Method, Request, RequestInit};

const AUDIO_HOST_SUFFIX: &str = "googlevideo.com";
const NATIVE_TIMEOUT_MS: u64 = 12_000;
const NATIVE_CLIENT_CHAIN: &[NativeClientProfile] = &[
    NativeClientProfile {
        name: "IOS",
        user_agent: "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iPhone OS 17_0 like Mac OS X)",
    },
    NativeClientProfile {
        name: "ANDROID_VR",
        user_agent: "com.google.android.apps.youtube.vr/1.57.52 (Linux; U; Android 14; en_US)",
    },
    NativeClientProfile {
        name: "ANDROID",
        user_agent: "com.google.android.youtube/19.45.38 (Linux; U; Android 14; en_US)",
    },
    NativeClientProfile {
        name: "WEB_EMBEDDED",
        user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioResolutionSource {
    Native,
    Legacy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioResolutionAttempt {
    pub client: &'static str,
    pub status: Option<String>,
    pub reason: Option<String>,
    pub direct_audio_url: bool,
    pub allowed_host: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioResolutionReport {
    pub source: AudioResolutionSource,
    pub used_legacy_fallback: bool,
    pub playability_failure: Option<String>,
    pub attempts: Vec<AudioResolutionAttempt>,
    pub range_capable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFixtureOutcome {
    pub fixture_id: String,
    pub native_success: bool,
    pub legacy_success: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFixtureRateSummary {
    pub fixture_count: usize,
    pub native_success_count: usize,
    pub legacy_success_count: usize,
    pub native_only_count: usize,
    pub legacy_only_count: usize,
    pub both_success_count: usize,
    pub both_fail_count: usize,
    pub native_success_rate: f64,
    pub legacy_success_rate: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeAudioStream {
    pub url: String,
    pub mime_type: String,
    pub client: &'static str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeAudioProbe {
    pub stream: Option<NativeAudioStream>,
    pub report: AudioResolutionReport,
}

#[derive(Debug, Clone)]
struct NativeClientProfile {
    name: &'static str,
    user_agent: &'static str,
}

#[derive(Debug, Clone, Deserialize)]
struct PlayerResponse {
    #[serde(rename = "playabilityStatus")]
    playability_status: Option<PlayabilityStatus>,
    #[serde(rename = "streamingData")]
    streaming_data: Option<StreamingData>,
}

#[derive(Debug, Clone, Deserialize)]
struct PlayabilityStatus {
    status: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct StreamingData {
    #[serde(default, rename = "adaptiveFormats")]
    adaptive_formats: Vec<StreamFormat>,
    #[serde(default)]
    formats: Vec<StreamFormat>,
}

#[derive(Debug, Clone, Deserialize)]
struct StreamFormat {
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    bitrate: Option<u64>,
    url: Option<String>,
    #[serde(rename = "signatureCipher")]
    signature_cipher: Option<String>,
    cipher: Option<String>,
}

pub fn is_valid_video_id(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 11
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

pub fn is_allowed_audio_url(raw_url: &str) -> bool {
    Url::parse(raw_url)
        .ok()
        .and_then(|url| url.host_str().map(|host| host.to_ascii_lowercase()))
        .is_some_and(|host| {
            host == AUDIO_HOST_SUFFIX || host.ends_with(&format!(".{AUDIO_HOST_SUFFIX}"))
        })
}

pub(crate) fn native_client_chain() -> &'static [NativeClientProfile] {
    NATIVE_CLIENT_CHAIN
}

pub fn summarize_fixture_rates(fixtures: &[AudioFixtureOutcome]) -> AudioFixtureRateSummary {
    let fixture_count = fixtures.len();
    let native_success_count = fixtures
        .iter()
        .filter(|fixture| fixture.native_success)
        .count();
    let legacy_success_count = fixtures
        .iter()
        .filter(|fixture| fixture.legacy_success)
        .count();
    let native_only_count = fixtures
        .iter()
        .filter(|fixture| fixture.native_success && !fixture.legacy_success)
        .count();
    let legacy_only_count = fixtures
        .iter()
        .filter(|fixture| !fixture.native_success && fixture.legacy_success)
        .count();
    let both_success_count = fixtures
        .iter()
        .filter(|fixture| fixture.native_success && fixture.legacy_success)
        .count();
    let both_fail_count = fixtures
        .iter()
        .filter(|fixture| !fixture.native_success && !fixture.legacy_success)
        .count();

    let denominator = fixture_count as f64;
    AudioFixtureRateSummary {
        fixture_count,
        native_success_count,
        legacy_success_count,
        native_only_count,
        legacy_only_count,
        both_success_count,
        both_fail_count,
        native_success_rate: if denominator > 0.0 {
            native_success_count as f64 / denominator
        } else {
            0.0
        },
        legacy_success_rate: if denominator > 0.0 {
            legacy_success_count as f64 / denominator
        } else {
            0.0
        },
    }
}

pub async fn resolve_native_audio_probe(video_id: &str) -> Result<NativeAudioProbe, worker::Error> {
    if !is_valid_video_id(video_id) {
        return Ok(NativeAudioProbe {
            stream: None,
            report: AudioResolutionReport {
                source: AudioResolutionSource::Native,
                used_legacy_fallback: false,
                playability_failure: Some("Invalid video id".into()),
                attempts: vec![AudioResolutionAttempt {
                    client: "validation",
                    status: Some("INVALID_ARGUMENT".into()),
                    reason: Some("Invalid video id".into()),
                    direct_audio_url: false,
                    allowed_host: false,
                }],
                range_capable: false,
            },
        });
    }

    let mut attempts = Vec::new();
    let mut playability_failure = None;

    for profile in NATIVE_CLIENT_CHAIN {
        match probe_client(profile, video_id).await {
            Ok(outcome) => {
                attempts.push(outcome.attempt);
                if let Some(stream) = outcome.stream {
                    return Ok(NativeAudioProbe {
                        stream: Some(stream),
                        report: AudioResolutionReport {
                            source: AudioResolutionSource::Native,
                            used_legacy_fallback: false,
                            playability_failure,
                            attempts,
                            range_capable: true,
                        },
                    });
                }
                if playability_failure.is_none() {
                    playability_failure = outcome.playability_failure;
                }
            }
            Err(error) => {
                attempts.push(AudioResolutionAttempt {
                    client: profile.name,
                    status: None,
                    reason: Some(error.message),
                    direct_audio_url: false,
                    allowed_host: false,
                });
            }
        }
    }

    Ok(NativeAudioProbe {
        stream: None,
        report: AudioResolutionReport {
            source: AudioResolutionSource::Native,
            used_legacy_fallback: false,
            playability_failure,
            attempts,
            range_capable: false,
        },
    })
}

#[derive(Debug)]
struct ProbeOutcome {
    attempt: AudioResolutionAttempt,
    stream: Option<NativeAudioStream>,
    playability_failure: Option<String>,
}

#[derive(Debug)]
struct ProbeError {
    message: String,
}

async fn probe_client(
    profile: &NativeClientProfile,
    video_id: &str,
) -> Result<ProbeOutcome, ProbeError> {
    let watch_url = build_watch_url(video_id);
    let watch_html = fetch_text(
        watch_url,
        profile.user_agent,
        &[("Accept-Language", "en-US,en;q=0.9")],
        "watch page",
    )
    .await
    .map_err(|message| ProbeError { message })?;

    if let Some(player_response) = extract_player_response_from_html(&watch_html) {
        let status = player_response
            .playability_status
            .as_ref()
            .and_then(|value| value.status.clone());
        let reason = player_response
            .playability_status
            .as_ref()
            .and_then(|value| value.reason.clone());
        if let Some(stream) = select_audio_stream(&player_response, profile.name) {
            return Ok(ProbeOutcome {
                attempt: AudioResolutionAttempt {
                    client: profile.name,
                    status,
                    reason: reason.clone(),
                    direct_audio_url: true,
                    allowed_host: true,
                },
                stream: Some(stream),
                playability_failure: reason,
            });
        }
        if !playability_is_ok(status.as_deref()) {
            return Ok(ProbeOutcome {
                attempt: AudioResolutionAttempt {
                    client: profile.name,
                    status: status.clone(),
                    reason: reason.clone(),
                    direct_audio_url: false,
                    allowed_host: false,
                },
                stream: None,
                playability_failure: reason.or(status),
            });
        }
    }

    let Some((api_key, client_version)) = extract_innertube_config(&watch_html) else {
        return Ok(ProbeOutcome {
            attempt: AudioResolutionAttempt {
                client: profile.name,
                status: Some("OK".into()),
                reason: Some("Missing InnerTube config".into()),
                direct_audio_url: false,
                allowed_host: false,
            },
            stream: None,
            playability_failure: Some("Missing InnerTube config".into()),
        });
    };

    let player_json = fetch_player_json(
        video_id,
        profile,
        &api_key,
        &client_version,
        profile.user_agent,
    )
    .await
    .map_err(|message| ProbeError { message })?;
    let status = player_json
        .playability_status
        .as_ref()
        .and_then(|value| value.status.clone());
    let reason = player_json
        .playability_status
        .as_ref()
        .and_then(|value| value.reason.clone());
    let stream = select_audio_stream(&player_json, profile.name);
    let direct_audio_url = stream.is_some();
    Ok(ProbeOutcome {
        attempt: AudioResolutionAttempt {
            client: profile.name,
            status,
            reason: reason.clone(),
            direct_audio_url,
            allowed_host: direct_audio_url,
        },
        stream,
        playability_failure: reason.or(status),
    })
}

fn select_audio_stream(
    response: &PlayerResponse,
    client: &'static str,
) -> Option<NativeAudioStream> {
    let streaming_data = response.streaming_data.as_ref()?;
    let mut candidates = streaming_data
        .adaptive_formats
        .iter()
        .chain(streaming_data.formats.iter())
        .filter(|format| {
            format
                .mime_type
                .as_deref()
                .is_some_and(|mime| mime.starts_with("audio/"))
        })
        .filter_map(|format| {
            let url = resolve_format_url(format)?;
            if !is_allowed_audio_url(&url) {
                return None;
            }
            Some((
                format.bitrate.unwrap_or(0),
                url,
                format
                    .mime_type
                    .clone()
                    .unwrap_or_else(|| "audio/mp4".into()),
            ))
        })
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| right.0.cmp(&left.0));
    candidates
        .into_iter()
        .next()
        .map(|(_, url, mime_type)| NativeAudioStream {
            url,
            mime_type,
            client,
        })
}

fn resolve_format_url(format: &StreamFormat) -> Option<String> {
    if let Some(url) = format
        .url
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        return Some(url.to_owned());
    }

    let cipher = format
        .signature_cipher
        .as_ref()
        .or(format.cipher.as_ref())?
        .trim();
    if cipher.is_empty() {
        return None;
    }

    let params = form_urlencoded::parse(cipher.as_bytes())
        .into_owned()
        .collect::<std::collections::HashMap<_, _>>();
    let url = params.get("url")?.trim();
    if url.is_empty() {
        return None;
    }

    let mut parsed = Url::parse(url).ok()?;
    if let Some(sp) = params
        .get("sp")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        if let Some(sig) = params.get("sig").or_else(|| params.get("signature")) {
            parsed.query_pairs_mut().append_pair(sp, sig);
        } else if params.get("s").is_some() {
            return None;
        }
    } else if let Some(sig) = params.get("sig").or_else(|| params.get("signature")) {
        parsed.query_pairs_mut().append_pair("sig", sig);
    } else if params.get("s").is_some() {
        return None;
    }
    Some(parsed.into())
}

fn extract_player_response_from_html(html: &str) -> Option<PlayerResponse> {
    let json = extract_json_object(html, "ytInitialPlayerResponse = ")?;
    serde_json::from_str(json).ok()
}

fn extract_innertube_config(html: &str) -> Option<(String, String)> {
    let json = extract_json_object(html, "ytcfg.set(")?;
    let value: Value = serde_json::from_str(json).ok()?;
    let api_key = value
        .get("INNERTUBE_API_KEY")
        .and_then(Value::as_str)?
        .trim()
        .to_owned();
    let client_version = value
        .get("INNERTUBE_CONTEXT_CLIENT_VERSION")
        .or_else(|| value.get("INNERTUBE_CLIENT_VERSION"))
        .and_then(Value::as_str)?
        .trim()
        .to_owned();
    Some((api_key, client_version))
}

fn extract_json_object<'a>(text: &'a str, marker: &str) -> Option<&'a str> {
    let start = text.find(marker)? + marker.len();
    let tail = &text[start..];
    let brace_offset = tail.find('{')?;
    let object_start = start + brace_offset;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (index, ch) in text[object_start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    let object_end = object_start + index + ch.len_utf8();
                    return Some(&text[object_start..object_end]);
                }
            }
            _ => {}
        }
    }

    None
}

fn playability_is_ok(status: Option<&str>) -> bool {
    matches!(status, None | Some("OK") | Some("CONTENT_CHECK_REQUIRED"))
}

fn build_watch_url(video_id: &str) -> Url {
    let mut url = Url::parse("https://www.youtube.com/watch").expect("static watch URL");
    url.query_pairs_mut()
        .append_pair("v", video_id)
        .append_pair("hl", "en")
        .append_pair("gl", "US")
        .append_pair("bpctr", "9999999999")
        .append_pair("has_verified", "1");
    url
}

async fn fetch_text(
    url: Url,
    user_agent: &str,
    extra_headers: &[(&str, &str)],
    label: &str,
) -> Result<String, String> {
    let headers = Headers::new();
    headers
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .map_err(|error| format!("{label} header failed: {error}"))?;
    headers
        .set("User-Agent", user_agent)
        .map_err(|error| format!("{label} header failed: {error}"))?;
    for (name, value) in extra_headers {
        headers
            .set(name, value)
            .map_err(|error| format!("{label} header failed: {error}"))?;
    }
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(url.as_str(), &init)
        .map_err(|error| format!("{label} request creation failed: {error}"))?;

    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch = Fetch::Request(request).send_with_signal(&signal);
    let timeout = Delay::from(Duration::from_millis(NATIVE_TIMEOUT_MS));
    pin_mut!(fetch, timeout);

    let mut response = match select(fetch, timeout).await {
        Either::Left((result, _)) => {
            result.map_err(|error| format!("{label} request failed: {error}"))?
        }
        Either::Right(((), _)) => {
            controller.abort();
            return Err(format!("{label} timed out after {NATIVE_TIMEOUT_MS} ms"));
        }
    };

    if !(200..300).contains(&response.status_code()) {
        return Err(format!("{label} returned HTTP {}", response.status_code()));
    }

    response
        .text()
        .await
        .map_err(|error| format!("{label} returned invalid text: {error}"))
}

async fn fetch_player_json(
    video_id: &str,
    profile: &NativeClientProfile,
    api_key: &str,
    client_version: &str,
    user_agent: &str,
) -> Result<PlayerResponse, String> {
    let mut url =
        Url::parse("https://www.youtube.com/youtubei/v1/player").expect("static player endpoint");
    url.query_pairs_mut().append_pair("key", api_key);

    let payload = serde_json::json!({
        "videoId": video_id,
        "context": {
            "client": {
                "clientName": profile.name,
                "clientVersion": client_version,
                "hl": "en",
                "gl": "US"
            }
        },
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS"
            }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    let mut headers = Headers::new();
    headers
        .set("Accept", "application/json")
        .map_err(|error| format!("player header failed: {error}"))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|error| format!("player header failed: {error}"))?;
    headers
        .set("User-Agent", user_agent)
        .map_err(|error| format!("player header failed: {error}"))?;
    headers
        .set("X-YouTube-Client-Name", profile.name)
        .map_err(|error| format!("player header failed: {error}"))?;
    headers
        .set("Origin", "https://www.youtube.com")
        .map_err(|error| format!("player header failed: {error}"))?;
    headers
        .set("Referer", "https://www.youtube.com/")
        .map_err(|error| format!("player header failed: {error}"))?;
    headers
        .set("X-YouTube-Client-Version", client_version)
        .map_err(|error| format!("player header failed: {error}"))?;

    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(payload.to_string().into_bytes().into()));
    let request = Request::new_with_init(url.as_str(), &init)
        .map_err(|error| format!("player request creation failed: {error}"))?;

    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch = Fetch::Request(request).send_with_signal(&signal);
    let timeout = Delay::from(Duration::from_millis(NATIVE_TIMEOUT_MS));
    pin_mut!(fetch, timeout);

    let mut response = match select(fetch, timeout).await {
        Either::Left((result, _)) => {
            result.map_err(|error| format!("player request failed: {error}"))?
        }
        Either::Right(((), _)) => {
            controller.abort();
            return Err(format!("player timed out after {NATIVE_TIMEOUT_MS} ms"));
        }
    };

    if !(200..300).contains(&response.status_code()) {
        return Err(format!("player returned HTTP {}", response.status_code()));
    }

    response
        .json::<PlayerResponse>()
        .await
        .map_err(|error| format!("player returned invalid JSON: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_video_ids() {
        assert!(is_valid_video_id("dQw4w9WgXcQ"));
        assert!(!is_valid_video_id("bad"));
        assert!(!is_valid_video_id("dQw4w9WgXcQ!"));
    }

    #[test]
    fn allows_googlevideo_hosts_only() {
        assert!(is_allowed_audio_url(
            "https://rr3---sn-abc.googlevideo.com/videoplayback?x=1"
        ));
        assert!(is_allowed_audio_url(
            "https://foo.googlevideo.com/videoplayback?x=1"
        ));
        assert!(!is_allowed_audio_url(
            "https://www.youtube.com/videoplayback?x=1"
        ));
    }

    #[test]
    fn bounded_client_chain_stays_short() {
        assert!(native_client_chain().len() <= 4);
        assert_eq!(
            native_client_chain().first().map(|client| client.name),
            Some("IOS")
        );
    }

    #[test]
    fn extracts_json_object_from_script() {
        let html = r#"
            <script>
            ytcfg.set({"INNERTUBE_API_KEY":"abc","INNERTUBE_CONTEXT_CLIENT_VERSION":"1.2.3"});
            var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"}};
            </script>
        "#;
        let cfg = extract_innertube_config(html).expect("cfg");
        assert_eq!(cfg.0, "abc");
        assert_eq!(cfg.1, "1.2.3");
        let player = extract_player_response_from_html(html).expect("player");
        assert_eq!(
            player
                .playability_status
                .as_ref()
                .and_then(|status| status.status.clone()),
            Some("OK".into())
        );
    }

    #[test]
    fn selects_highest_bitrate_audio_with_allowed_host() {
        let response = PlayerResponse {
            playability_status: Some(PlayabilityStatus {
                status: Some("OK".into()),
                reason: None,
            }),
            streaming_data: Some(StreamingData {
                adaptive_formats: vec![
                    StreamFormat {
                        mime_type: Some("video/mp4".into()),
                        bitrate: Some(1_000_000),
                        url: Some("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1".into()),
                        signature_cipher: None,
                        cipher: None,
                    },
                    StreamFormat {
                        mime_type: Some("audio/mp4".into()),
                        bitrate: Some(256_000),
                        url: Some(
                            "https://rr3---sn-abc.googlevideo.com/videoplayback?audio=1".into(),
                        ),
                        signature_cipher: None,
                        cipher: None,
                    },
                    StreamFormat {
                        mime_type: Some("audio/mp4".into()),
                        bitrate: Some(128_000),
                        url: Some("https://www.youtube.com/videoplayback?audio=2".into()),
                        signature_cipher: None,
                        cipher: None,
                    },
                ],
                formats: Vec::new(),
            }),
        };
        let stream = select_audio_stream(&response, "IOS").expect("stream");
        assert_eq!(
            stream.url,
            "https://rr3---sn-abc.googlevideo.com/videoplayback?audio=1"
        );
        assert_eq!(stream.mime_type, "audio/mp4");
        assert_eq!(stream.client, "IOS");
    }

    #[test]
    fn resolves_ciphers_with_custom_signature_param_name() {
        let format = StreamFormat {
            mime_type: Some("audio/mp4".into()),
            bitrate: Some(128_000),
            url: None,
            signature_cipher: Some(
                "url=https%3A%2F%2Frm.googlevideo.com%2Fvideoplayback%3Fx%3D1&sp=signature&sig=abc123"
                    .into(),
            ),
            cipher: None,
        };
        let url = resolve_format_url(&format).expect("url");
        assert_eq!(
            url,
            "https://rm.googlevideo.com/videoplayback?x=1&signature=abc123"
        );
    }

    #[test]
    fn summarizes_fixture_rates() {
        let summary = summarize_fixture_rates(&[
            AudioFixtureOutcome {
                fixture_id: "a".into(),
                native_success: true,
                legacy_success: true,
            },
            AudioFixtureOutcome {
                fixture_id: "b".into(),
                native_success: true,
                legacy_success: false,
            },
            AudioFixtureOutcome {
                fixture_id: "c".into(),
                native_success: false,
                legacy_success: true,
            },
            AudioFixtureOutcome {
                fixture_id: "d".into(),
                native_success: false,
                legacy_success: false,
            },
        ]);

        assert_eq!(summary.fixture_count, 4);
        assert_eq!(summary.native_success_count, 2);
        assert_eq!(summary.legacy_success_count, 2);
        assert_eq!(summary.native_only_count, 1);
        assert_eq!(summary.legacy_only_count, 1);
        assert_eq!(summary.both_success_count, 1);
        assert_eq!(summary.both_fail_count, 1);
        assert!((summary.native_success_rate - 0.5).abs() < f64::EPSILON);
        assert!((summary.legacy_success_rate - 0.5).abs() < f64::EPSILON);
    }
}
