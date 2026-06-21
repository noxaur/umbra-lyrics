use serde::Serialize;
use serde_json::json;
#[cfg(target_arch = "wasm32")]
use worker::console_error;

pub(crate) fn emit_json_log(kind: &'static str, payload: &impl Serialize) {
    let Ok(data) = serde_json::to_value(payload) else {
        return;
    };
    let log = json!({
        "level": "info",
        "origin": "rust",
        "kind": kind,
        "data": data,
    });
    #[cfg(not(target_arch = "wasm32"))]
    let _ = log;

    #[cfg(target_arch = "wasm32")]
    if let Ok(message) = serde_json::to_string(&log) {
        console_error!("{}", message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone, Copy)]
    struct Broken;

    impl Serialize for Broken {
        fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            Err(serde::ser::Error::custom("broken serializer"))
        }
    }

    #[test]
    fn ignores_serialization_failures() {
        emit_json_log("resolution_trace", &Broken);
    }

    #[test]
    fn serializes_plain_payloads() {
        let payload = json!({
            "kind": "resolution_trace",
            "requestId": "request-123",
            "cache": { "status": "miss" },
        });
        let message = serde_json::to_string(&json!({
            "level": "info",
            "origin": "rust",
            "kind": "resolution_trace",
            "data": payload,
        }))
        .expect("log serializes");
        assert!(message.contains("\"requestId\":\"request-123\""));
        assert!(!message.contains("plainLyrics"));
        assert!(!message.contains("syncedLyrics"));
        assert!(!message.contains("audioUrl"));
    }
}
