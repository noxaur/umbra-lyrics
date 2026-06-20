use http::Uri;
use umbra_rust_worker::{route_request, RouteDecision};

fn uri(value: &str) -> Uri {
    value.parse().expect("valid test URI")
}

#[test]
fn redirects_non_api_http_requests_to_https() {
    assert_eq!(
        route_request(&uri("http://song.example/play/dQw4w9WgXcQ?from=test")),
        RouteDecision::Redirect {
            location: "https://song.example/play/dQw4w9WgXcQ?from=test".into(),
            include_isolation: true,
        }
    );
}

#[test]
fn routes_resolution_requests_to_rust() {
    assert_eq!(
        route_request(&uri("http://song.example/api/lyrics/resolve")),
        RouteDecision::Resolution
    );
    assert_eq!(
        route_request(&uri("http://song.example/api/lyrics/resolve/")),
        RouteDecision::Resolution
    );
}

#[test]
fn leaves_other_http_api_requests_for_the_legacy_worker() {
    assert_eq!(
        route_request(&uri("http://song.example/api/youtube/search")),
        RouteDecision::Legacy
    );
}

#[test]
fn redirects_valid_watch_urls_to_the_canonical_player_path() {
    assert_eq!(
        route_request(&uri(
            "https://song.example/watch?v=dQw4w9WgXcQ&feature=share"
        )),
        RouteDecision::Redirect {
            location: "https://song.example/play/dQw4w9WgXcQ".into(),
            include_isolation: false,
        }
    );
}

#[test]
fn sends_invalid_watch_urls_to_static_assets() {
    assert_eq!(
        route_request(&uri("https://song.example/watch?v=too-short")),
        RouteDecision::Assets
    );
}

#[test]
fn forwards_unknown_api_paths_so_the_legacy_shell_controls_fallback_behavior() {
    assert_eq!(
        route_request(&uri("https://song.example/api/not-a-route")),
        RouteDecision::Legacy
    );
}

#[test]
fn sends_application_routes_to_static_assets() {
    assert_eq!(
        route_request(&uri("https://song.example/play/dQw4w9WgXcQ")),
        RouteDecision::Assets
    );
}

#[test]
fn allows_loopback_http_for_local_multi_worker_smoke_tests() {
    assert_eq!(
        route_request(&uri("http://127.0.0.1:8787/")),
        RouteDecision::Assets
    );
}
