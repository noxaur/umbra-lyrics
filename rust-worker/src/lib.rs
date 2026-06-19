use http::Uri;
use serde::Serialize;
use url::Url;
use uuid::Uuid;
use worker::{console_error, event, Context, Env, Headers, Request, RequestInit, Response, Result};

const ASSETS_BINDING: &str = "ASSETS";
const LEGACY_BINDING: &str = "LEGACY";
const REQUEST_ID_HEADER: &str = "x-umbra-request-id";
const ORIGIN_HEADER: &str = "x-umbra-origin";
const GATEWAY_HEADER: &str = "x-umbra-gateway";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteDecision {
    Redirect {
        location: String,
        include_isolation: bool,
    },
    Legacy,
    Assets,
}

pub fn route_request(uri: &Uri) -> RouteDecision {
    let path = uri.path();

    if uri.scheme_str() == Some("http")
        && !path.starts_with("/api/")
        && !is_loopback_host(uri.host())
    {
        return RouteDecision::Redirect {
            location: replace_scheme(uri, "https"),
            include_isolation: true,
        };
    }

    if path == "/watch" {
        if let Some(video_id) = watch_video_id(uri) {
            return RouteDecision::Redirect {
                location: canonical_player_url(uri, &video_id),
                include_isolation: false,
            };
        }
    }

    if path.starts_with("/api/") {
        RouteDecision::Legacy
    } else {
        RouteDecision::Assets
    }
}

#[event(fetch)]
pub async fn fetch(request: Request, env: Env, _ctx: Context) -> Result<Response> {
    let request_id = request_id(request.headers());
    let uri: Uri = request
        .url()?
        .as_str()
        .parse()
        .map_err(|error| worker::Error::RustError(format!("invalid request URI: {error}")))?;
    let decision = route_request(&uri);
    let forwarded_request = forwarded_request(&request, &request_id)?;

    match decision {
        RouteDecision::Redirect {
            location,
            include_isolation,
        } => {
            let response = Response::redirect_with_status(Url::parse(&location)?, 301)?;
            decorate_response(response, &request_id, "rust", include_isolation)
        }
        RouteDecision::Legacy => match env.service(LEGACY_BINDING) {
            Ok(legacy) => match legacy.fetch_request(forwarded_request).await {
                Ok(response) => decorate_response(response, &request_id, "legacy", false),
                Err(error) => gateway_error(&request_id, "legacy_service", &error),
            },
            Err(error) => gateway_error(&request_id, "legacy_binding", &error),
        },
        RouteDecision::Assets => match env.assets(ASSETS_BINDING) {
            Ok(assets) => match assets.fetch_request(forwarded_request).await {
                Ok(response) => decorate_response(response, &request_id, "rust-assets", true),
                Err(error) => gateway_error(&request_id, "assets_service", &error),
            },
            Err(error) => gateway_error(&request_id, "assets_binding", &error),
        },
    }
}

fn forwarded_request(request: &Request, request_id: &str) -> Result<Request> {
    let headers: Headers = request.headers().entries().collect();
    headers.set(REQUEST_ID_HEADER, request_id)?;
    headers.set(GATEWAY_HEADER, "rust")?;

    let mut init = RequestInit::new();
    init.with_method(request.method())
        .with_headers(headers)
        .with_body(request.inner().body().map(Into::into));

    Request::new_with_init(request.url()?.as_str(), &init)
}

fn is_loopback_host(host: Option<&str>) -> bool {
    matches!(host, Some("localhost" | "127.0.0.1" | "::1"))
}

fn watch_video_id(uri: &Uri) -> Option<String> {
    let query = uri.query()?;
    let video_id = url::form_urlencoded::parse(query.as_bytes())
        .find_map(|(key, value)| (key == "v").then_some(value.into_owned()))?;

    is_video_id(&video_id).then_some(video_id)
}

fn is_video_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn replace_scheme(uri: &Uri, scheme: &str) -> String {
    let mut url = Url::parse(&uri.to_string()).expect("incoming Worker URI must be absolute");
    url.set_scheme(scheme)
        .expect("http and https are valid hierarchical schemes");
    url.into()
}

fn canonical_player_url(uri: &Uri, video_id: &str) -> String {
    let mut url = Url::parse(&uri.to_string()).expect("incoming Worker URI must be absolute");
    url.set_path(&format!("/play/{video_id}"));
    url.set_query(None);
    url.set_fragment(None);
    url.into()
}

fn request_id(headers: &Headers) -> String {
    headers
        .get(REQUEST_ID_HEADER)
        .ok()
        .flatten()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty() && value.len() <= 128)
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}

fn decorate_response(
    response: Response,
    request_id: &str,
    origin: &'static str,
    include_isolation: bool,
) -> Result<Response> {
    let status = response.status_code();
    let headers: Headers = response.headers().entries().collect();
    headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
    )?;
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin")?;
    headers.set(REQUEST_ID_HEADER, request_id)?;
    headers.set(ORIGIN_HEADER, origin)?;

    if include_isolation {
        headers.set("Cross-Origin-Opener-Policy", "same-origin")?;
        headers.set("Cross-Origin-Embedder-Policy", "credentialless")?;
    }

    let (_, body) = response.into_parts();
    Ok(Response::from_body(body)?
        .with_status(status)
        .with_headers(headers))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayError<'a> {
    error: &'static str,
    origin: &'static str,
    stage: &'a str,
    request_id: &'a str,
}

fn gateway_error(request_id: &str, stage: &str, error: &worker::Error) -> Result<Response> {
    console_error!(
        "{{\"level\":\"error\",\"origin\":\"rust\",\"stage\":\"{}\",\"requestId\":\"{}\",\"message\":{}}}",
        stage,
        request_id,
        serde_json::to_string(&error.to_string())?
    );

    let body = GatewayError {
        error: "rust_gateway_error",
        origin: "rust",
        stage,
        request_id,
    };
    let mut response = Response::from_json(&body)?.with_status(502);
    response
        .headers_mut()
        .set("Access-Control-Allow-Origin", "*")?;

    decorate_response(response, request_id, "rust", false)
}
