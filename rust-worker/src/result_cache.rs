use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use worker::kv::KvStore;

use crate::resolution::Event;

pub const RESULT_CACHE_BINDING: &str = "RESULT_CACHE";
pub const CACHE_SCHEMA_VERSION: u32 = 1;
pub const CACHE_PIPELINE_VERSION: &str = "task-07-v1";

const SUCCESS_TTL_SECS: u64 = 24 * 60 * 60;
const NEGATIVE_TTL_SECS: u64 = 60 * 60;
const TRANSIENT_TTL_SECS: u64 = 5 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheOutcomeClass {
    Successful,
    Negative,
    Transient,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CachedResolutionReplay {
    pub schema_version: u32,
    pub pipeline_version: String,
    pub video_id: String,
    pub outcome_class: CacheOutcomeClass,
    pub events: Vec<Event>,
}

pub trait ResolutionCacheBackend: Send + Sync {
    fn get<'a>(&'a self, key: &'a str) -> BoxFuture<'a, Option<CachedResolutionReplay>>;

    fn put<'a>(
        &'a self,
        key: &'a str,
        replay: &'a CachedResolutionReplay,
        ttl_secs: u64,
    ) -> BoxFuture<'a, ()>;
}

#[derive(Clone, Debug)]
pub struct KvResolutionCache {
    store: KvStore,
}

impl KvResolutionCache {
    pub fn new(store: KvStore) -> Self {
        Self { store }
    }
}

impl ResolutionCacheBackend for KvResolutionCache {
    fn get<'a>(&'a self, key: &'a str) -> BoxFuture<'a, Option<CachedResolutionReplay>> {
        Box::pin(async move {
            self.store
                .get(key)
                .json::<CachedResolutionReplay>()
                .await
                .ok()
                .flatten()
        })
    }

    fn put<'a>(
        &'a self,
        key: &'a str,
        replay: &'a CachedResolutionReplay,
        ttl_secs: u64,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            if let Ok(builder) = self.store.put(key, replay) {
                let _ = builder.expiration_ttl(ttl_secs).execute().await;
            }
        })
    }
}

pub fn cache_key(video_id: &str) -> String {
    format!(
        "umbra:lyrics:resolve:v{}:{}:{}",
        CACHE_SCHEMA_VERSION, CACHE_PIPELINE_VERSION, video_id
    )
}

pub fn cache_ttl_secs(outcome_class: CacheOutcomeClass) -> u64 {
    match outcome_class {
        CacheOutcomeClass::Successful => SUCCESS_TTL_SECS,
        CacheOutcomeClass::Negative => NEGATIVE_TTL_SECS,
        CacheOutcomeClass::Transient => TRANSIENT_TTL_SECS,
    }
}

pub fn replay_from_events(video_id: &str, events: Vec<Event>) -> Option<CachedResolutionReplay> {
    let outcome_class = classify_terminal_event(events.last()?)?;
    Some(CachedResolutionReplay {
        schema_version: CACHE_SCHEMA_VERSION,
        pipeline_version: CACHE_PIPELINE_VERSION.to_owned(),
        video_id: video_id.to_owned(),
        outcome_class,
        events,
    })
}

pub async fn load_replay(
    cache: &dyn ResolutionCacheBackend,
    key: &str,
    video_id: &str,
) -> Option<CachedResolutionReplay> {
    let replay = cache.get(key).await?;
    if replay.schema_version != CACHE_SCHEMA_VERSION {
        return None;
    }
    if replay.pipeline_version != CACHE_PIPELINE_VERSION {
        return None;
    }
    if replay.video_id != video_id {
        return None;
    }
    let Some(last_event) = replay.events.last() else {
        return None;
    };
    if classify_terminal_event(last_event).is_none() {
        return None;
    }
    Some(replay)
}

pub async fn store_replay(
    cache: &dyn ResolutionCacheBackend,
    key: &str,
    replay: &CachedResolutionReplay,
    force_refresh: bool,
) -> bool {
    if !force_refresh {
        if let Some(existing) = cache.get(key).await {
            if existing == *replay {
                return false;
            }
        }
    }

    let ttl = cache_ttl_secs(replay.outcome_class);
    cache.put(key, replay, ttl).await;
    true
}

pub fn classify_terminal_event(event: &Event) -> Option<CacheOutcomeClass> {
    match event.name.as_str() {
        "result" => match event
            .data
            .get("outcome")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
        {
            "found" => Some(CacheOutcomeClass::Successful),
            "not_found" | "empty" | "instrumental" => Some(CacheOutcomeClass::Negative),
            "partial" | "error" | "transient" => Some(CacheOutcomeClass::Transient),
            _ => Some(CacheOutcomeClass::Transient),
        },
        "error" => Some(CacheOutcomeClass::Transient),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::HashMap,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Mutex,
        },
    };

    #[derive(Default)]
    struct MockCache {
        values: Mutex<HashMap<String, CachedResolutionReplay>>,
        reads: AtomicUsize,
        writes: AtomicUsize,
    }

    impl MockCache {
        fn write_count(&self) -> usize {
            self.writes.load(Ordering::SeqCst)
        }
    }

    impl ResolutionCacheBackend for MockCache {
        fn get<'a>(&'a self, key: &'a str) -> BoxFuture<'a, Option<CachedResolutionReplay>> {
            Box::pin(async move {
                self.reads.fetch_add(1, Ordering::SeqCst);
                self.values.lock().expect("cache").get(key).cloned()
            })
        }

        fn put<'a>(
            &'a self,
            key: &'a str,
            replay: &'a CachedResolutionReplay,
            _ttl_secs: u64,
        ) -> BoxFuture<'a, ()> {
            Box::pin(async move {
                self.writes.fetch_add(1, Ordering::SeqCst);
                self.values
                    .lock()
                    .expect("cache")
                    .insert(key.to_owned(), replay.clone());
            })
        }
    }

    fn replay(outcome: CacheOutcomeClass) -> CachedResolutionReplay {
        CachedResolutionReplay {
            schema_version: CACHE_SCHEMA_VERSION,
            pipeline_version: CACHE_PIPELINE_VERSION.to_owned(),
            video_id: "dQw4w9WgXcQ".into(),
            outcome_class: outcome,
            events: vec![
                Event::new("metadata", serde_json::json!({"kind": "canonical"})),
                Event::new("result", serde_json::json!({"outcome": "not_found"})),
            ],
        }
    }

    #[test]
    fn cache_key_embeds_version_and_video_id() {
        let key = cache_key("dQw4w9WgXcQ");
        assert!(key.contains("dQw4w9WgXcQ"));
        assert!(key.contains(CACHE_PIPELINE_VERSION));
        assert!(key.contains(&format!("v{}", CACHE_SCHEMA_VERSION)));
    }

    #[test]
    fn ttl_classes_are_distinct() {
        assert!(
            cache_ttl_secs(CacheOutcomeClass::Successful)
                > cache_ttl_secs(CacheOutcomeClass::Negative)
        );
        assert!(
            cache_ttl_secs(CacheOutcomeClass::Negative)
                > cache_ttl_secs(CacheOutcomeClass::Transient)
        );
    }

    #[test]
    fn load_replay_ignores_outdated_entries() {
        let cache = MockCache::default();
        let key = cache_key("dQw4w9WgXcQ");
        cache.values.lock().expect("cache").insert(
            key.clone(),
            CachedResolutionReplay {
                schema_version: CACHE_SCHEMA_VERSION + 1,
                pipeline_version: CACHE_PIPELINE_VERSION.to_owned(),
                video_id: "dQw4w9WgXcQ".into(),
                outcome_class: CacheOutcomeClass::Negative,
                events: vec![Event::new(
                    "result",
                    serde_json::json!({"outcome": "not_found"}),
                )],
            },
        );

        let loaded = futures::executor::block_on(load_replay(&cache, &key, "dQw4w9WgXcQ"));
        assert!(loaded.is_none());
    }

    #[test]
    fn load_replay_ignores_empty_entries() {
        let cache = MockCache::default();
        let key = cache_key("dQw4w9WgXcQ");
        cache.values.lock().expect("cache").insert(
            key.clone(),
            CachedResolutionReplay {
                schema_version: CACHE_SCHEMA_VERSION,
                pipeline_version: CACHE_PIPELINE_VERSION.to_owned(),
                video_id: "dQw4w9WgXcQ".into(),
                outcome_class: CacheOutcomeClass::Negative,
                events: vec![],
            },
        );

        let loaded = futures::executor::block_on(load_replay(&cache, &key, "dQw4w9WgXcQ"));
        assert!(loaded.is_none());
    }

    #[test]
    fn load_replay_ignores_nonterminal_entries() {
        let cache = MockCache::default();
        let key = cache_key("dQw4w9WgXcQ");
        cache.values.lock().expect("cache").insert(
            key.clone(),
            CachedResolutionReplay {
                schema_version: CACHE_SCHEMA_VERSION,
                pipeline_version: CACHE_PIPELINE_VERSION.to_owned(),
                video_id: "dQw4w9WgXcQ".into(),
                outcome_class: CacheOutcomeClass::Negative,
                events: vec![Event::new(
                    "phase",
                    serde_json::json!({"phase": "accepted"}),
                )],
            },
        );

        let loaded = futures::executor::block_on(load_replay(&cache, &key, "dQw4w9WgXcQ"));
        assert!(loaded.is_none());
    }

    #[test]
    fn store_replay_skips_duplicate_writes_but_force_refresh_replaces() {
        let cache = MockCache::default();
        let key = cache_key("dQw4w9WgXcQ");
        let replay = replay(CacheOutcomeClass::Negative);

        let wrote = futures::executor::block_on(store_replay(&cache, &key, &replay, false));
        assert!(wrote);
        let wrote_again = futures::executor::block_on(store_replay(&cache, &key, &replay, false));
        assert!(!wrote_again);
        let forced = futures::executor::block_on(store_replay(&cache, &key, &replay, true));
        assert!(forced);
        assert_eq!(cache.write_count(), 2);
    }

    #[test]
    fn concurrent_duplicate_writes_collapse_to_one_write() {
        let cache = MockCache::default();
        let key = cache_key("dQw4w9WgXcQ");
        let replay = replay(CacheOutcomeClass::Negative);

        let (first, second) = futures::executor::block_on(async {
            futures::join!(
                store_replay(&cache, &key, &replay, false),
                store_replay(&cache, &key, &replay, false),
            )
        });

        assert!(first || second);
        assert_eq!(cache.write_count(), 1);
    }

    #[test]
    fn classifies_terminal_events() {
        assert_eq!(
            classify_terminal_event(&Event::new(
                "result",
                serde_json::json!({"outcome": "found"})
            )),
            Some(CacheOutcomeClass::Successful)
        );
        assert_eq!(
            classify_terminal_event(&Event::new(
                "result",
                serde_json::json!({"outcome": "not_found"})
            )),
            Some(CacheOutcomeClass::Negative)
        );
        assert_eq!(
            classify_terminal_event(&Event::new("error", serde_json::json!({"code": "boom"}))),
            Some(CacheOutcomeClass::Transient)
        );
    }
}
