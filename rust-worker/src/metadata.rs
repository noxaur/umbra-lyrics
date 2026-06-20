use std::{cmp::Ordering, collections::HashMap, time::Duration};

use futures_util::{
    future::{select, Either},
    join, pin_mut,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use url::Url;
use worker::{AbortController, Delay, Env, Fetch, Headers, Method, Request, RequestInit};

const DEFAULT_TIMEOUT_MS: u64 = 5_000;
const MIN_TIMEOUT_MS: u64 = 100;
const MAX_TIMEOUT_MS: u64 = 15_000;
const DEFAULT_MUSICBRAINZ_USER_AGENT: &str = "umbra/1.0.0 (https://github.com/noxaur/umbra-lyrics)";
const MAX_SEARCH_SEEDS: usize = 2;

#[derive(Debug, Clone, PartialEq)]
pub struct MetadataInput {
    pub video_id: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MetadataSource {
    Supplied,
    Oembed,
    Musicbrainz,
    Deezer,
}

impl MetadataSource {
    fn priority(self) -> i32 {
        match self {
            Self::Musicbrainz => 4,
            Self::Deezer => 3,
            Self::Oembed => 2,
            Self::Supplied => 1,
        }
    }

    fn source_points(self) -> i32 {
        match self {
            Self::Musicbrainz => 12,
            Self::Deezer => 10,
            Self::Oembed => 4,
            Self::Supplied => 2,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StableIds {
    pub youtube_video_id: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
    pub deezer_track_id: Option<String>,
    pub isrc: Option<String>,
}

impl StableIds {
    fn merge(&mut self, other: &Self) {
        if self.youtube_video_id.is_none() {
            self.youtube_video_id.clone_from(&other.youtube_video_id);
        }
        if self.musicbrainz_recording_id.is_none() {
            self.musicbrainz_recording_id
                .clone_from(&other.musicbrainz_recording_id);
        }
        if self.deezer_track_id.is_none() {
            self.deezer_track_id.clone_from(&other.deezer_track_id);
        }
        if self.isrc.is_none() {
            self.isrc.clone_from(&other.isrc);
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringReason {
    pub code: &'static str,
    pub points: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCandidate {
    pub artist: String,
    pub track: String,
    pub duration: Option<f64>,
    pub source: MetadataSource,
    pub source_id: Option<String>,
    pub stable_ids: StableIds,
    pub score: i32,
    pub scoring_reasons: Vec<ScoringReason>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceWarning {
    pub source: MetadataSource,
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MetadataResolution {
    pub selected: MetadataCandidate,
    pub candidates: Vec<MetadataCandidate>,
    pub warnings: Vec<SourceWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetadataConfig {
    timeout_ms: u64,
    musicbrainz_user_agent: String,
}

impl MetadataConfig {
    pub fn from_env(env: &Env) -> Self {
        Self::from_values(
            env.var("METADATA_SOURCE_TIMEOUT_MS")
                .ok()
                .map(|value| value.to_string())
                .as_deref(),
            env.var("MUSICBRAINZ_USER_AGENT")
                .ok()
                .map(|value| value.to_string())
                .as_deref(),
        )
    }

    fn from_values(timeout_ms: Option<&str>, musicbrainz_user_agent: Option<&str>) -> Self {
        let timeout_ms = timeout_ms
            .and_then(|value| value.trim().parse::<u64>().ok())
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
        let musicbrainz_user_agent = musicbrainz_user_agent
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_MUSICBRAINZ_USER_AGENT)
            .to_owned();
        Self {
            timeout_ms,
            musicbrainz_user_agent,
        }
    }

    fn split_timeout(&self, attempts: usize) -> Self {
        Self {
            timeout_ms: (self.timeout_ms / attempts.max(1) as u64).max(MIN_TIMEOUT_MS),
            musicbrainz_user_agent: self.musicbrainz_user_agent.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MetadataGuess {
    artist: String,
    track: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
struct OembedMetadata {
    title: String,
    author_name: String,
}

#[derive(Debug, Clone)]
struct SourceFailure {
    source: MetadataSource,
    code: &'static str,
    message: String,
}

impl SourceFailure {
    fn warning(self) -> SourceWarning {
        SourceWarning {
            source: self.source,
            code: self.code,
            message: self.message,
            retryable: true,
        }
    }
}

pub async fn resolve_metadata(
    input: &MetadataInput,
    config: &MetadataConfig,
) -> MetadataResolution {
    let mut warnings = Vec::new();
    let oembed = match fetch_oembed(&input.video_id, config).await {
        Ok(metadata) => Some(metadata),
        Err(failure) => {
            warnings.push(failure.warning());
            None
        }
    };

    let mut candidates = seed_candidates(input, oembed.as_ref());
    let guesses = metadata_guesses(input, oembed.as_ref());
    let search_seeds = search_seeds(&guesses);
    let (musicbrainz, deezer) = join!(
        fetch_musicbrainz(&search_seeds, input, config),
        fetch_deezer(&search_seeds, input, config)
    );
    match musicbrainz {
        Ok(found) => candidates.extend(found),
        Err(failure) => warnings.push(failure.warning()),
    }
    match deezer {
        Ok(found) => candidates.extend(found),
        Err(failure) => warnings.push(failure.warning()),
    }

    rank_metadata_with_guesses(input, guesses, candidates, warnings)
}

#[cfg(test)]
pub(crate) fn rank_metadata(
    input: &MetadataInput,
    candidates: Vec<MetadataCandidate>,
) -> MetadataResolution {
    rank_metadata_with_guesses(input, metadata_guesses(input, None), candidates, Vec::new())
}

fn rank_metadata_with_guesses(
    input: &MetadataInput,
    guesses: Vec<MetadataGuess>,
    candidates: Vec<MetadataCandidate>,
    warnings: Vec<SourceWarning>,
) -> MetadataResolution {
    let mut candidates = dedupe_candidates(candidates);
    if candidates.is_empty() {
        candidates.push(empty_fallback(input));
    }

    for candidate in &mut candidates {
        let (mut score, mut reasons) = best_text_score(candidate, &guesses);
        let source_points = candidate.source.source_points();
        score += source_points;
        reasons.push(ScoringReason {
            code: match candidate.source {
                MetadataSource::Supplied => "source_supplied",
                MetadataSource::Oembed => "source_oembed",
                MetadataSource::Musicbrainz => "source_musicbrainz",
                MetadataSource::Deezer => "source_deezer",
            },
            points: source_points,
        });

        let (duration_code, duration_points) = duration_score(candidate.duration, input.duration);
        score += duration_points;
        reasons.push(ScoringReason {
            code: duration_code,
            points: duration_points,
        });

        if author_agrees(&candidate.artist, input.author.as_deref()) {
            score += 8;
            reasons.push(ScoringReason {
                code: "supplied_author_agreement",
                points: 8,
            });
        }
        candidate.score = score;
        candidate.scoring_reasons = reasons;
    }

    candidates.sort_by(compare_candidates);
    let selected = candidates[0].clone();
    MetadataResolution {
        selected,
        candidates,
        warnings,
    }
}

fn compare_candidates(left: &MetadataCandidate, right: &MetadataCandidate) -> Ordering {
    right
        .score
        .cmp(&left.score)
        .then_with(|| right.source.priority().cmp(&left.source.priority()))
        .then_with(|| normalized(&left.artist).cmp(&normalized(&right.artist)))
        .then_with(|| normalized(&left.track).cmp(&normalized(&right.track)))
        .then_with(|| left.source_id.cmp(&right.source_id))
}

fn best_text_score(
    candidate: &MetadataCandidate,
    guesses: &[MetadataGuess],
) -> (i32, Vec<ScoringReason>) {
    guesses
        .iter()
        .map(|guess| {
            let (artist_code, artist_points) =
                text_score(&candidate.artist, &guess.artist, "artist");
            let (track_code, track_points) = text_score(&candidate.track, &guess.track, "track");
            (
                artist_points + track_points,
                vec![
                    ScoringReason {
                        code: artist_code,
                        points: artist_points,
                    },
                    ScoringReason {
                        code: track_code,
                        points: track_points,
                    },
                ],
            )
        })
        .max_by_key(|(score, _)| *score)
        .unwrap_or_else(|| {
            (
                0,
                vec![
                    ScoringReason {
                        code: "artist_unavailable",
                        points: 0,
                    },
                    ScoringReason {
                        code: "track_unavailable",
                        points: 0,
                    },
                ],
            )
        })
}

fn text_score(found: &str, wanted: &str, field: &'static str) -> (&'static str, i32) {
    let found = normalized(found);
    let wanted = normalized(wanted);
    if found.is_empty() || wanted.is_empty() {
        return (
            if field == "artist" {
                "artist_unavailable"
            } else {
                "track_unavailable"
            },
            0,
        );
    }
    if found == wanted {
        return (
            if field == "artist" {
                "artist_exact"
            } else {
                "track_exact"
            },
            if field == "artist" { 30 } else { 45 },
        );
    }
    if found.contains(&wanted) || wanted.contains(&found) {
        return (
            if field == "artist" {
                "artist_contains"
            } else {
                "track_contains"
            },
            if field == "artist" { 20 } else { 30 },
        );
    }

    let overlap = token_overlap(&found, &wanted);
    if overlap >= 0.5 {
        (
            if field == "artist" {
                "artist_token_overlap"
            } else {
                "track_token_overlap"
            },
            if field == "artist" { 15 } else { 24 },
        )
    } else {
        (
            if field == "artist" {
                "artist_mismatch"
            } else {
                "track_mismatch"
            },
            0,
        )
    }
}

fn duration_score(found: Option<f64>, wanted: Option<f64>) -> (&'static str, i32) {
    let (Some(found), Some(wanted)) = (found, wanted) else {
        return ("duration_unavailable", 0);
    };
    let delta = (found - wanted).abs();
    if delta <= 3.0 {
        ("duration_close", 15)
    } else if delta <= 10.0 {
        ("duration_near", 10)
    } else if delta <= 30.0 {
        ("duration_loose", 3)
    } else {
        ("duration_far", -10)
    }
}

fn author_agrees(artist: &str, author: Option<&str>) -> bool {
    let Some(author) = author else {
        return false;
    };
    let artist = normalized(artist);
    let author = normalized(&strip_channel_suffix(author));
    !artist.is_empty() && artist == author
}

fn token_overlap(left: &str, right: &str) -> f64 {
    let left: Vec<&str> = left.split_whitespace().collect();
    let right: Vec<&str> = right.split_whitespace().collect();
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let common = left.iter().filter(|token| right.contains(token)).count();
    common as f64 / left.len().max(right.len()) as f64
}

fn normalized(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn dedupe_candidates(mut candidates: Vec<MetadataCandidate>) -> Vec<MetadataCandidate> {
    candidates.sort_by(|left, right| {
        right
            .source
            .priority()
            .cmp(&left.source.priority())
            .then_with(|| left.source_id.cmp(&right.source_id))
            .then_with(|| left.artist.cmp(&right.artist))
            .then_with(|| left.track.cmp(&right.track))
    });
    let mut deduped: Vec<MetadataCandidate> = Vec::new();
    let mut positions: HashMap<String, usize> = HashMap::new();
    for candidate in candidates {
        if candidate.track.trim().is_empty() {
            continue;
        }
        let key = format!(
            "{}\0{}",
            normalized(&candidate.artist),
            normalized(&candidate.track)
        );
        if let Some(index) = positions.get(&key).copied() {
            let existing = &mut deduped[index];
            existing.stable_ids.merge(&candidate.stable_ids);
            if existing.duration.is_none() {
                existing.duration = candidate.duration;
            }
            if candidate.source.priority() > existing.source.priority() {
                existing.source = candidate.source;
                existing.source_id = candidate.source_id;
            }
        } else {
            positions.insert(key, deduped.len());
            deduped.push(candidate);
        }
    }
    deduped
}

fn seed_candidates(
    input: &MetadataInput,
    oembed: Option<&OembedMetadata>,
) -> Vec<MetadataCandidate> {
    let mut candidates = Vec::new();
    let youtube_id = Some(input.video_id.clone());
    for guess in guesses_for_title(input.title.as_deref(), input.author.as_deref()) {
        candidates.push(candidate_from_guess(
            guess,
            input.duration,
            MetadataSource::Supplied,
            youtube_id.clone(),
        ));
    }
    if let Some(oembed) = oembed {
        for guess in guesses_for_title(Some(&oembed.title), Some(&oembed.author_name)) {
            candidates.push(candidate_from_guess(
                guess,
                input.duration,
                MetadataSource::Oembed,
                youtube_id.clone(),
            ));
        }
    }
    candidates
}

fn candidate_from_guess(
    guess: MetadataGuess,
    duration: Option<f64>,
    source: MetadataSource,
    youtube_video_id: Option<String>,
) -> MetadataCandidate {
    MetadataCandidate {
        artist: guess.artist,
        track: guess.track,
        duration,
        source,
        source_id: None,
        stable_ids: StableIds {
            youtube_video_id,
            ..StableIds::default()
        },
        score: 0,
        scoring_reasons: Vec::new(),
    }
}

fn metadata_guesses(input: &MetadataInput, oembed: Option<&OembedMetadata>) -> Vec<MetadataGuess> {
    let mut guesses = guesses_for_title(input.title.as_deref(), input.author.as_deref());
    if let Some(oembed) = oembed {
        guesses.extend(guesses_for_title(
            Some(&oembed.title),
            Some(&oembed.author_name),
        ));
    }
    dedupe_guesses(guesses)
}

fn guesses_for_title(title: Option<&str>, author: Option<&str>) -> Vec<MetadataGuess> {
    let title = title.map(str::trim).filter(|value| !value.is_empty());
    let author = author
        .map(strip_channel_suffix)
        .filter(|value| !value.is_empty());
    let mut guesses = Vec::new();
    let Some(title) = title else {
        return guesses;
    };
    let cleaned = clean_title(title);

    if let Some(topic_artist) = author
        .as_deref()
        .and_then(|value| value.strip_suffix(" - Topic"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        guesses.push(MetadataGuess {
            artist: topic_artist.to_owned(),
            track: cleaned.clone(),
        });
    }

    if title.contains('|') {
        for segment in title
            .split('|')
            .map(clean_title)
            .filter(|segment| !segment.is_empty() && !is_promo_segment(segment))
        {
            guesses.push(MetadataGuess {
                artist: String::new(),
                track: segment,
            });
        }
    }

    if !title.contains('|') {
        for separator in [" - ", " – ", " — ", ": "] {
            if let Some((left, right)) = cleaned.split_once(separator) {
                if !left.trim().is_empty() && !right.trim().is_empty() {
                    guesses.push(MetadataGuess {
                        artist: left.trim().to_owned(),
                        track: right.trim().to_owned(),
                    });
                    guesses.push(MetadataGuess {
                        artist: right.trim().to_owned(),
                        track: left.trim().to_owned(),
                    });
                }
            }
        }

        guesses.push(MetadataGuess {
            artist: author.unwrap_or_default(),
            track: cleaned,
        });
    }
    dedupe_guesses(guesses)
}

fn clean_title(title: &str) -> String {
    let mut output = String::with_capacity(title.len());
    let mut depth = 0_u32;
    for character in title.chars() {
        match character {
            '(' | '[' | '（' | '【' => depth += 1,
            ')' | ']' | '）' | '】' => depth = depth.saturating_sub(1),
            _ if depth == 0 => output.push(character),
            _ => {}
        }
    }
    let mut cleaned = output.split_whitespace().collect::<Vec<_>>().join(" ");
    for suffix in [
        "official music video",
        "official video",
        "lyrics video",
        "lyric video",
        "music video",
        "visualizer",
        "official audio",
    ] {
        if cleaned.to_ascii_lowercase().ends_with(suffix) {
            let new_len = cleaned.len().saturating_sub(suffix.len());
            cleaned.truncate(new_len);
            cleaned = cleaned.trim_matches([' ', '-', '|']).trim().to_owned();
        }
    }
    cleaned
}

fn is_promo_segment(value: &str) -> bool {
    matches!(
        normalized(value).as_str(),
        "music video"
            | "official music video"
            | "official video"
            | "lyric video"
            | "lyrics video"
            | "official audio"
    )
}

fn strip_channel_suffix(value: &str) -> String {
    let value = value.trim();
    for suffix in [" - Topic", " - VEVO", " Official Channel", " Official"] {
        if value
            .to_ascii_lowercase()
            .ends_with(&suffix.to_ascii_lowercase())
        {
            return value[..value.len() - suffix.len()].trim().to_owned();
        }
    }
    value.to_owned()
}

fn dedupe_guesses(guesses: Vec<MetadataGuess>) -> Vec<MetadataGuess> {
    let mut seen = HashMap::new();
    let mut deduped = Vec::new();
    for guess in guesses {
        if guess.track.trim().is_empty() {
            continue;
        }
        let key = format!(
            "{}\0{}",
            normalized(&guess.artist),
            normalized(&guess.track)
        );
        if seen.insert(key, ()).is_none() {
            deduped.push(guess);
        }
    }
    deduped
}

fn search_seeds(guesses: &[MetadataGuess]) -> Vec<MetadataGuess> {
    guesses
        .iter()
        .filter(|guess| !guess.track.is_empty())
        .take(MAX_SEARCH_SEEDS)
        .cloned()
        .collect()
}

fn empty_fallback(input: &MetadataInput) -> MetadataCandidate {
    MetadataCandidate {
        artist: input.author.clone().unwrap_or_default(),
        track: input.title.clone().unwrap_or_default(),
        duration: input.duration,
        source: MetadataSource::Supplied,
        source_id: None,
        stable_ids: StableIds {
            youtube_video_id: Some(input.video_id.clone()),
            ..StableIds::default()
        },
        score: 0,
        scoring_reasons: Vec::new(),
    }
}

async fn fetch_oembed(
    video_id: &str,
    config: &MetadataConfig,
) -> Result<OembedMetadata, SourceFailure> {
    let mut last_failure = None;
    let hosts = ["music.youtube.com", "www.youtube.com"];
    let attempt_config = config.split_timeout(hosts.len());
    for host in hosts {
        let watch_url = format!("https://{host}/watch?v={video_id}");
        let mut url = Url::parse("https://www.youtube.com/oembed").expect("static URL");
        url.query_pairs_mut()
            .append_pair("url", &watch_url)
            .append_pair("format", "json");
        match fetch_json(
            url,
            MetadataSource::Oembed,
            &attempt_config,
            &[],
            "YouTube oEmbed",
        )
        .await
        {
            Ok(metadata) => return Ok(metadata),
            Err(failure) => last_failure = Some(failure),
        }
    }
    Err(last_failure.unwrap_or_else(|| SourceFailure {
        source: MetadataSource::Oembed,
        code: "source_unavailable",
        message: "YouTube oEmbed returned no metadata".into(),
    }))
}

#[derive(Debug, Deserialize)]
struct MusicbrainzResponse {
    #[serde(default)]
    recordings: Vec<MusicbrainzRecording>,
}

#[derive(Debug, Deserialize)]
struct MusicbrainzRecording {
    id: String,
    title: String,
    length: Option<f64>,
    #[serde(default, rename = "artist-credit")]
    artist_credit: Vec<MusicbrainzArtistCredit>,
    #[serde(default)]
    isrcs: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MusicbrainzArtistCredit {
    name: Option<String>,
    artist: Option<MusicbrainzArtist>,
}

#[derive(Debug, Deserialize)]
struct MusicbrainzArtist {
    name: Option<String>,
}

async fn fetch_musicbrainz(
    seeds: &[MetadataGuess],
    input: &MetadataInput,
    config: &MetadataConfig,
) -> Result<Vec<MetadataCandidate>, SourceFailure> {
    if seeds.is_empty() {
        return Ok(Vec::new());
    }
    let mut candidates = Vec::new();
    let mut last_failure = None;
    let attempt_config = config.split_timeout(seeds.len());
    for seed in seeds {
        let query = if seed.artist.is_empty() {
            format!("recording:\"{}\"", seed.track)
        } else {
            format!(
                "recording:\"{}\" AND artist:\"{}\"",
                seed.track, seed.artist
            )
        };
        let mut url = Url::parse("https://musicbrainz.org/ws/2/recording").expect("static URL");
        url.query_pairs_mut()
            .append_pair("query", &query)
            .append_pair("fmt", "json")
            .append_pair("limit", "5");
        let headers = [
            ("Accept", "application/json"),
            ("User-Agent", config.musicbrainz_user_agent.as_str()),
        ];
        match fetch_json::<MusicbrainzResponse>(
            url,
            MetadataSource::Musicbrainz,
            &attempt_config,
            &headers,
            "MusicBrainz",
        )
        .await
        {
            Ok(response) => {
                candidates.extend(response.recordings.into_iter().filter_map(|recording| {
                    let recording_id = recording.id.trim().to_owned();
                    let artist = recording
                        .artist_credit
                        .first()
                        .and_then(|credit| {
                            credit
                                .name
                                .as_deref()
                                .or_else(|| credit.artist.as_ref()?.name.as_deref())
                        })
                        .unwrap_or_default()
                        .trim()
                        .to_owned();
                    let track = recording.title.trim().to_owned();
                    if recording_id.is_empty() || artist.is_empty() || track.is_empty() {
                        return None;
                    }
                    Some(MetadataCandidate {
                        artist,
                        track,
                        duration: recording.length.map(|milliseconds| milliseconds / 1000.0),
                        source: MetadataSource::Musicbrainz,
                        source_id: Some(recording_id.clone()),
                        stable_ids: StableIds {
                            youtube_video_id: Some(input.video_id.clone()),
                            musicbrainz_recording_id: Some(recording_id),
                            isrc: recording.isrcs.first().cloned(),
                            ..StableIds::default()
                        },
                        score: 0,
                        scoring_reasons: Vec::new(),
                    })
                }))
            }
            Err(failure) => last_failure = Some(failure),
        }
    }
    if candidates.is_empty() {
        if let Some(failure) = last_failure {
            Err(failure)
        } else {
            Ok(candidates)
        }
    } else {
        Ok(candidates)
    }
}

#[derive(Debug, Deserialize)]
struct DeezerResponse {
    #[serde(default)]
    data: Vec<DeezerTrack>,
}

#[derive(Debug, Deserialize)]
struct DeezerTrack {
    id: u64,
    title: String,
    duration: Option<f64>,
    isrc: Option<String>,
    artist: Option<DeezerArtist>,
}

#[derive(Debug, Deserialize)]
struct DeezerArtist {
    name: Option<String>,
}

async fn fetch_deezer(
    seeds: &[MetadataGuess],
    input: &MetadataInput,
    config: &MetadataConfig,
) -> Result<Vec<MetadataCandidate>, SourceFailure> {
    if seeds.is_empty() {
        return Ok(Vec::new());
    }
    let mut candidates = Vec::new();
    let mut last_failure = None;
    let attempt_config = config.split_timeout(seeds.len());
    for seed in seeds {
        let query = format!("{} {}", seed.artist, seed.track)
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let mut url = Url::parse("https://api.deezer.com/search").expect("static URL");
        url.query_pairs_mut()
            .append_pair("q", &query)
            .append_pair("limit", "5");
        match fetch_json::<DeezerResponse>(
            url,
            MetadataSource::Deezer,
            &attempt_config,
            &[],
            "Deezer",
        )
        .await
        {
            Ok(response) => candidates.extend(response.data.into_iter().filter_map(|track| {
                let title = track.title.trim().to_owned();
                let artist = track
                    .artist
                    .and_then(|artist| artist.name)
                    .unwrap_or_default()
                    .trim()
                    .to_owned();
                if track.id == 0 || artist.is_empty() || title.is_empty() {
                    return None;
                }
                let id = track.id.to_string();
                Some(MetadataCandidate {
                    artist,
                    track: title,
                    duration: track.duration,
                    source: MetadataSource::Deezer,
                    source_id: Some(id.clone()),
                    stable_ids: StableIds {
                        youtube_video_id: Some(input.video_id.clone()),
                        deezer_track_id: Some(id),
                        isrc: track.isrc,
                        ..StableIds::default()
                    },
                    score: 0,
                    scoring_reasons: Vec::new(),
                })
            })),
            Err(failure) => last_failure = Some(failure),
        }
    }
    if candidates.is_empty() {
        if let Some(failure) = last_failure {
            Err(failure)
        } else {
            Ok(candidates)
        }
    } else {
        Ok(candidates)
    }
}

async fn fetch_json<T: DeserializeOwned>(
    url: Url,
    source: MetadataSource,
    config: &MetadataConfig,
    headers: &[(&str, &str)],
    label: &str,
) -> Result<T, SourceFailure> {
    let request_headers = Headers::new();
    for (name, value) in headers {
        request_headers
            .set(name, value)
            .map_err(|error| SourceFailure {
                source,
                code: "source_configuration",
                message: format!("{label} request header failed: {error}"),
            })?;
    }
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(request_headers);
    let request = Request::new_with_init(url.as_str(), &init).map_err(|error| SourceFailure {
        source,
        code: "source_configuration",
        message: format!("{label} request creation failed: {error}"),
    })?;

    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch_request = Fetch::Request(request);
    let fetch = async {
        let mut response = fetch_request
            .send_with_signal(&signal)
            .await
            .map_err(|error| SourceFailure {
                source,
                code: "source_unavailable",
                message: format!("{label} request failed: {error}"),
            })?;
        if !(200..300).contains(&response.status_code()) {
            return Err(SourceFailure {
                source,
                code: "source_http_error",
                message: format!("{label} returned HTTP {}", response.status_code()),
            });
        }
        response.json::<T>().await.map_err(|error| SourceFailure {
            source,
            code: "source_invalid_response",
            message: format!("{label} returned invalid JSON: {error}"),
        })
    };
    let timeout = Delay::from(Duration::from_millis(config.timeout_ms));
    pin_mut!(fetch, timeout);
    match select(fetch, timeout).await {
        Either::Left((result, _)) => result,
        Either::Right(((), _)) => {
            controller.abort();
            Err(SourceFailure {
                source,
                code: "source_timeout",
                message: format!("{label} timed out after {} ms", config.timeout_ms),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(
        artist: &str,
        track: &str,
        source: MetadataSource,
        source_id: Option<&str>,
    ) -> MetadataCandidate {
        MetadataCandidate {
            artist: artist.into(),
            track: track.into(),
            duration: Some(247.0),
            source,
            source_id: source_id.map(str::to_owned),
            stable_ids: StableIds {
                youtube_video_id: Some("Rbgw_rduQpM".into()),
                musicbrainz_recording_id: (source == MetadataSource::Musicbrainz)
                    .then(|| source_id.map(str::to_owned))
                    .flatten(),
                deezer_track_id: (source == MetadataSource::Deezer)
                    .then(|| source_id.map(str::to_owned))
                    .flatten(),
                ..StableIds::default()
            },
            score: 0,
            scoring_reasons: Vec::new(),
        }
    }

    fn wrong_title_input() -> MetadataInput {
        MetadataInput {
            video_id: "Rbgw_rduQpM".into(),
            title: Some("I Really Want to Stay at Your House - Rosa Walton".into()),
            author: Some("Netflix".into()),
            duration: Some(247.0),
        }
    }

    #[test]
    fn alternate_title_orientation_can_select_canonical_provider_metadata() {
        let input = wrong_title_input();
        let resolved = rank_metadata(
            &input,
            vec![
                candidate(
                    "Netflix",
                    "I Really Want to Stay at Your House",
                    MetadataSource::Supplied,
                    None,
                ),
                candidate(
                    "Rosa Walton",
                    "I Really Want to Stay at Your House",
                    MetadataSource::Musicbrainz,
                    Some("mb-recording"),
                ),
            ],
        );

        assert_eq!(resolved.selected.artist, "Rosa Walton");
        assert_eq!(
            resolved.selected.track,
            "I Really Want to Stay at Your House"
        );
        assert_eq!(
            resolved
                .selected
                .stable_ids
                .musicbrainz_recording_id
                .as_deref(),
            Some("mb-recording")
        );
        assert!(resolved
            .selected
            .scoring_reasons
            .iter()
            .any(|reason| reason.code == "artist_exact"));
    }

    #[test]
    fn ranking_is_deterministic_and_merges_stable_ids() {
        let input = wrong_title_input();
        let candidates = vec![
            candidate(
                "Rosa Walton",
                "I Really Want to Stay at Your House",
                MetadataSource::Deezer,
                Some("31337"),
            ),
            candidate(
                "Rosa Walton",
                "I Really Want to Stay at Your House",
                MetadataSource::Musicbrainz,
                Some("mb-recording"),
            ),
        ];
        let first = rank_metadata(&input, candidates.clone());
        let second = rank_metadata(&input, candidates.into_iter().rev().collect());

        assert_eq!(first.selected, second.selected);
        assert_eq!(first.selected.source, MetadataSource::Musicbrainz);
        assert_eq!(
            first.selected.stable_ids.deezer_track_id.as_deref(),
            Some("31337")
        );
        assert_eq!(
            first
                .selected
                .stable_ids
                .musicbrainz_recording_id
                .as_deref(),
            Some("mb-recording")
        );
    }

    #[test]
    fn pipe_title_exposes_alternate_track_seed() {
        let guesses = guesses_for_title(
            Some("Cyberpunk: Edgerunners | I Really Want to Stay At Your House | Music Video"),
            Some("Netflix"),
        );

        assert!(guesses.iter().any(|guess| {
            guess.artist.is_empty() && guess.track == "I Really Want to Stay At Your House"
        }));
    }

    #[test]
    fn incorrect_youtube_pipe_title_prefers_canonical_provider_artist() {
        let input = MetadataInput {
            video_id: "Rbgw_rduQpM".into(),
            title: Some(
                "Cyberpunk: Edgerunners | I Really Want to Stay At Your House | Music Video".into(),
            ),
            author: Some("Netflix".into()),
            duration: Some(247.0),
        };
        let mut candidates = seed_candidates(&input, None);
        candidates.push(candidate(
            "Rosa Walton",
            "I Really Want to Stay At Your House",
            MetadataSource::Musicbrainz,
            Some("mb-recording"),
        ));

        let resolution = rank_metadata(&input, candidates);

        assert_eq!(resolution.selected.artist, "Rosa Walton");
        assert_eq!(
            resolution.selected.track,
            "I Really Want to Stay At Your House"
        );
    }

    #[test]
    fn source_failures_are_non_terminal_resolution_warnings() {
        let input = wrong_title_input();
        let warnings = vec![SourceFailure {
            source: MetadataSource::Deezer,
            code: "source_timeout",
            message: "Deezer timed out".into(),
        }
        .warning()];
        let resolution = rank_metadata_with_guesses(
            &input,
            metadata_guesses(&input, None),
            seed_candidates(&input, None),
            warnings,
        );

        assert_eq!(
            resolution.selected.stable_ids.youtube_video_id.as_deref(),
            Some("Rbgw_rduQpM")
        );
        assert_eq!(resolution.warnings[0].code, "source_timeout");
    }

    #[test]
    fn timeout_config_is_bounded_and_user_agent_has_public_default() {
        assert_eq!(
            MetadataConfig::from_values(Some("1"), None).timeout_ms,
            MIN_TIMEOUT_MS
        );
        assert_eq!(
            MetadataConfig::from_values(Some("999999"), None).timeout_ms,
            MAX_TIMEOUT_MS
        );
        assert!(MetadataConfig::from_values(None, None)
            .musicbrainz_user_agent
            .contains("github.com/noxaur/umbra-lyrics"));
    }
}
