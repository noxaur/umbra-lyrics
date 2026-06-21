use std::cmp::Ordering;

use serde::Serialize;

use crate::lyrics::{LyricsCandidate, LyricsInput, LyricsSource};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeLyricsOutcome {
    Found,
    Instrumental,
    LowConfidence,
    NotFound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeLyricsLineKind {
    Lyric,
    Section,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLyricsLine {
    pub start_ms: u32,
    pub end_ms: u32,
    pub text: String,
    pub kind: NativeLyricsLineKind,
    pub approximate: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLyricsScoringReason {
    pub code: &'static str,
    pub points: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLyricsResult {
    pub outcome: NativeLyricsOutcome,
    pub video_id: String,
    pub title: String,
    pub author: String,
    pub duration: Option<f64>,
    pub provider_id: Option<String>,
    pub id: Option<String>,
    pub track_name: Option<String>,
    pub artist_name: Option<String>,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub synced: bool,
    pub approximate_timing: bool,
    pub lines: Vec<NativeLyricsLine>,
    pub score: Option<i32>,
    pub confidence: Option<u8>,
    pub scoring_reasons: Vec<NativeLyricsScoringReason>,
    pub alternates: Vec<NativeLyricsAlternate>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLyricsAlternate {
    pub provider_id: String,
    pub id: String,
    pub track_name: String,
    pub artist_name: String,
    pub synced: bool,
    pub line_count: usize,
    pub rank_score: i32,
    pub lyrics_result: NativeLyricsResultLite,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeLyricsResultLite {
    pub id: String,
    pub provider_id: String,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub synced: bool,
}

#[derive(Debug, Clone)]
struct RankedNativeCandidate {
    candidate: LyricsCandidate,
    score: i32,
    confidence: u8,
    line_count: usize,
    text: String,
    scoring_reasons: Vec<NativeLyricsScoringReason>,
}

fn normalized_text(value: &str) -> String {
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

fn text_penalty(candidate: &str, expected: &str) -> (i32, &'static str) {
    let candidate = normalized_text(candidate);
    let expected = normalized_text(expected);

    if candidate.is_empty() || expected.is_empty() {
        return (24, "text_missing");
    }
    if candidate == expected {
        return (0, "text_exact");
    }
    if candidate.contains(&expected) || expected.contains(&candidate) {
        return (10, "text_overlap");
    }

    let candidate_tokens = candidate.split_whitespace().collect::<Vec<_>>();
    let expected_tokens = expected.split_whitespace().collect::<Vec<_>>();
    let overlap = candidate_tokens
        .iter()
        .filter(|token| expected_tokens.contains(token))
        .count();
    if overlap > 0 && overlap * 2 >= expected_tokens.len().max(candidate_tokens.len()) {
        return (18, "text_partial");
    }

    (36, "text_mismatch")
}

fn duration_penalty(candidate: Option<f64>, expected: Option<f64>) -> (i32, &'static str) {
    let (Some(candidate), Some(expected)) = (candidate, expected) else {
        return (0, "duration_unknown");
    };
    let diff = (candidate - expected).abs();
    if diff <= 2.0 {
        (0, "duration_exact")
    } else if diff <= 10.0 {
        (5, "duration_close")
    } else if diff <= 30.0 {
        (14, "duration_near")
    } else if diff <= 60.0 {
        (28, "duration_far")
    } else {
        (42, "duration_mismatch")
    }
}

fn detect_language(text: &str) -> &'static str {
    if text
        .chars()
        .any(|character| ('\u{AC00}'..='\u{D7A3}').contains(&character))
    {
        return "ko";
    }
    if text
        .chars()
        .any(|character| ('\u{3040}'..='\u{30FF}').contains(&character))
    {
        return "ja";
    }
    if text
        .chars()
        .any(|character| ('\u{0400}'..='\u{04FF}').contains(&character))
    {
        return "ru";
    }
    if text.chars().any(|character| {
        "\u{00E1}\u{00E9}\u{00ED}\u{00F3}\u{00FA}\u{00F1}\u{00FC}\u{00BF}\u{00A1}"
            .contains(character)
    }) {
        return "es";
    }
    if text.trim().is_empty() {
        "und"
    } else {
        "en"
    }
}

fn language_penalty(text: &str, preferred_language: Option<&str>) -> (i32, &'static str) {
    let Some(preferred_language) = preferred_language
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.split('-').next().unwrap_or(value))
    else {
        return (0, "language_unspecified");
    };
    let detected = detect_language(text);
    if detected == preferred_language {
        return (0, "language_match");
    }
    if detected == "und" || preferred_language == "und" {
        return (10, "language_unknown");
    }
    (24, "language_mismatch")
}

fn source_penalty(source: LyricsSource) -> (i32, &'static str) {
    match source {
        LyricsSource::LrclibExact => (0, "source_lrclib_exact"),
        LyricsSource::LrclibVariant => (5, "source_lrclib_variant"),
        LyricsSource::LyricsOvh => (14, "source_lyrics_ovh"),
        LyricsSource::Genius => (22, "source_genius"),
    }
}

fn provider_id(source: LyricsSource) -> &'static str {
    match source {
        LyricsSource::LrclibExact | LyricsSource::LrclibVariant => "lrclib",
        LyricsSource::LyricsOvh => "lyrics-ovh",
        LyricsSource::Genius => "genius",
    }
}

fn cleaned_text(candidate: &LyricsCandidate) -> String {
    if candidate.synced {
        candidate
            .synced_lyrics
            .as_deref()
            .map(strip_lrc_timestamps)
            .unwrap_or_default()
    } else {
        candidate.plain_lyrics.clone()
    }
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

fn looks_like_junk(text: &str) -> bool {
    let lowered = text.to_ascii_lowercase();
    let markers = [
        "document.write",
        "cf_async",
        "clickfuse",
        "adunit_id",
        "<script",
        "cookie policy",
        "cookieconsent",
        "og:description",
        "contributors",
        "translations",
        "var opts",
        "you might also like",
        "lyrics.net",
        "playlist",
    ];
    markers.iter().any(|marker| lowered.contains(marker))
}

fn line_count(text: &str) -> usize {
    text.lines().filter(|line| !line.trim().is_empty()).count()
}

fn complete_text_penalty(text: &str) -> (i32, &'static str) {
    let count = line_count(text);
    if count == 0 {
        return (80, "text_empty");
    }
    if count < 4 {
        return (48, "line_count_short");
    }
    if text.trim().len() < 80 {
        return (22, "text_short");
    }
    (0, "text_complete")
}

fn rank_candidate(
    candidate: &LyricsCandidate,
    input: &LyricsInput,
    preferred_language: Option<&str>,
) -> RankedNativeCandidate {
    let text = cleaned_text(candidate);
    let line_count = line_count(&text);
    let mut score = 0;
    let mut scoring_reasons = Vec::new();

    let (source_points, source_code) = source_penalty(candidate.source);
    score += source_points;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: source_code,
        points: source_points,
    });

    let (artist_points, artist_code) = text_penalty(&candidate.artist, &input.artist);
    score += artist_points;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: artist_code,
        points: artist_points,
    });

    let (track_points, track_code) = text_penalty(&candidate.track, &input.track);
    score += track_points;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: track_code,
        points: track_points,
    });

    let (duration_points, duration_code) = duration_penalty(candidate.duration, input.duration);
    score += duration_points;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: duration_code,
        points: duration_points,
    });

    let synced_points = if candidate.synced {
        (-120, "synced_lrc")
    } else {
        (80, "plain_timing")
    };
    score += synced_points.0;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: synced_points.1,
        points: synced_points.0,
    });

    let (line_points, line_code) = complete_text_penalty(&text);
    score += line_points;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: line_code,
        points: line_points,
    });

    let junk_points = if looks_like_junk(&text) { 250 } else { 0 };
    if junk_points > 0 {
        score += junk_points;
    }
    scoring_reasons.push(NativeLyricsScoringReason {
        code: if junk_points > 0 {
            "junk_rejected"
        } else {
            "junk_clean"
        },
        points: junk_points,
    });

    let (language_points, language_code) = language_penalty(&text, preferred_language);
    score += language_points;
    scoring_reasons.push(NativeLyricsScoringReason {
        code: language_code,
        points: language_points,
    });

    if candidate.instrumental {
        score += 100;
        scoring_reasons.push(NativeLyricsScoringReason {
            code: "instrumental",
            points: 100,
        });
    } else {
        scoring_reasons.push(NativeLyricsScoringReason {
            code: "vocal",
            points: 0,
        });
    }

    let confidence_penalty =
        line_points + junk_points + language_points + if candidate.instrumental { 100 } else { 0 };
    let confidence = (100 - confidence_penalty).clamp(0, 100) as u8;

    RankedNativeCandidate {
        candidate: candidate.clone(),
        score,
        confidence,
        line_count,
        text,
        scoring_reasons,
    }
}

fn rank_candidates(
    candidates: &[LyricsCandidate],
    input: &LyricsInput,
    preferred_language: Option<&str>,
) -> Vec<RankedNativeCandidate> {
    let mut ranked = candidates
        .iter()
        .map(|candidate| rank_candidate(candidate, input, preferred_language))
        .collect::<Vec<_>>();
    ranked.sort_by(compare_ranked_candidates);
    ranked
}

fn compare_ranked_candidates(
    left: &RankedNativeCandidate,
    right: &RankedNativeCandidate,
) -> Ordering {
    left.score
        .cmp(&right.score)
        .then_with(|| right.confidence.cmp(&left.confidence))
        .then_with(|| {
            source_penalty(left.candidate.source)
                .0
                .cmp(&source_penalty(right.candidate.source).0)
        })
        .then_with(|| {
            normalized_text(&left.candidate.artist).cmp(&normalized_text(&right.candidate.artist))
        })
        .then_with(|| {
            normalized_text(&left.candidate.track).cmp(&normalized_text(&right.candidate.track))
        })
        .then_with(|| left.candidate.source_id.cmp(&right.candidate.source_id))
}

fn parse_timestamp_tag(tag: &str) -> Option<u32> {
    let parts = tag.split(':').collect::<Vec<_>>();
    match parts.as_slice() {
        [minutes, seconds] => {
            let (seconds, fraction) = split_fraction(seconds);
            Some(
                minutes.parse::<u32>().ok()? * 60_000
                    + seconds.parse::<u32>().ok()? * 1000
                    + fraction,
            )
        }
        [hours, minutes, seconds] => {
            let (seconds, fraction) = split_fraction(seconds);
            Some(
                hours.parse::<u32>().ok()? * 3_600_000
                    + minutes.parse::<u32>().ok()? * 60_000
                    + seconds.parse::<u32>().ok()? * 1000
                    + fraction,
            )
        }
        _ => None,
    }
}

fn split_fraction(value: &str) -> (&str, u32) {
    if let Some((whole, frac)) = value.split_once('.') {
        let fraction = if frac.len() == 2 {
            frac.parse::<u32>().ok().unwrap_or(0) * 10
        } else {
            frac.get(..3)
                .and_then(|slice| slice.parse::<u32>().ok())
                .unwrap_or(0)
        };
        (whole, fraction)
    } else {
        (value, 0)
    }
}

fn parse_lrc_lines(text: &str, duration_ms: Option<u32>) -> (Vec<NativeLyricsLine>, bool) {
    let mut parsed = Vec::<(u32, String)>::new();

    for raw_line in text.lines() {
        let mut rest = raw_line.trim();
        let mut timestamps = Vec::<u32>::new();

        while let Some(after_open) = rest.strip_prefix('[') {
            let Some(close) = after_open.find(']') else {
                break;
            };
            let tag = &after_open[..close];
            let Some(start_ms) = parse_timestamp_tag(tag) else {
                break;
            };
            timestamps.push(start_ms);
            rest = after_open[close + 1..].trim_start();
        }

        let lyric = rest.trim();
        if timestamps.is_empty() || lyric.is_empty() {
            continue;
        }

        for start_ms in timestamps {
            parsed.push((start_ms, lyric.to_owned()));
        }
    }

    parsed.sort_by_key(|entry| entry.0);
    let mut lines = Vec::with_capacity(parsed.len());

    for (index, (start_ms, text)) in parsed.iter().enumerate() {
        let end_ms = parsed
            .get(index + 1)
            .map(|entry| entry.0)
            .or(duration_ms)
            .unwrap_or(start_ms.saturating_add(5_000));
        lines.push(NativeLyricsLine {
            start_ms: *start_ms,
            end_ms: end_ms.max(*start_ms),
            text: text.clone(),
            kind: NativeLyricsLineKind::Lyric,
            approximate: false,
        });
    }

    (lines, false)
}

fn approximate_timing_lines(text: &str, duration_ms: Option<u32>) -> Vec<NativeLyricsLine> {
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return Vec::new();
    }

    let total_ms = duration_ms
        .unwrap_or_else(|| (lines.len() as u32).saturating_mul(5_000))
        .max(lines.len() as u32 * 1_000);
    let slice_ms = (total_ms / lines.len() as u32).max(1_000);
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
                end_ms: end_ms.max(start_ms + 1_000),
                text,
                kind: NativeLyricsLineKind::Lyric,
                approximate: true,
            }
        })
        .collect()
}

fn build_lines(candidate: &LyricsCandidate) -> (Vec<NativeLyricsLine>, bool) {
    let duration_ms = candidate
        .duration
        .map(|duration| (duration * 1000.0).round() as u32);
    if candidate.synced {
        if let Some(synced) = candidate.synced_lyrics.as_deref() {
            return parse_lrc_lines(synced, duration_ms);
        }
    }

    let text = if !candidate.plain_lyrics.trim().is_empty() {
        candidate.plain_lyrics.clone()
    } else {
        candidate
            .synced_lyrics
            .as_deref()
            .map(strip_lrc_timestamps)
            .unwrap_or_default()
    };

    (approximate_timing_lines(&text, duration_ms), true)
}

fn confidence_threshold(candidate: &RankedNativeCandidate) -> bool {
    candidate.confidence >= 60 && !candidate.candidate.instrumental
}

fn build_selected(candidate: &RankedNativeCandidate, input: &LyricsInput) -> NativeLyricsResult {
    let mut selected = candidate.candidate.clone();
    selected.duration = input.duration.or(selected.duration);
    let (lines, approximate_timing) = build_lines(&selected);
    NativeLyricsResult {
        outcome: if candidate.candidate.instrumental {
            NativeLyricsOutcome::Instrumental
        } else if confidence_threshold(candidate) {
            NativeLyricsOutcome::Found
        } else {
            NativeLyricsOutcome::LowConfidence
        },
        video_id: String::new(),
        title: input.track.clone(),
        author: input.artist.clone(),
        duration: selected.duration,
        provider_id: Some(provider_id(candidate.candidate.source).into()),
        id: candidate.candidate.source_id.clone(),
        track_name: Some(candidate.candidate.track.clone()),
        artist_name: Some(candidate.candidate.artist.clone()),
        plain_lyrics: if candidate.text.trim().is_empty() {
            None
        } else {
            Some(candidate.text.clone())
        },
        synced_lyrics: candidate.candidate.synced_lyrics.clone(),
        synced: candidate.candidate.synced,
        approximate_timing: approximate_timing || !candidate.candidate.synced,
        lines,
        score: Some(candidate.score),
        confidence: Some(candidate.confidence),
        scoring_reasons: candidate.scoring_reasons.clone(),
        alternates: Vec::new(),
        message: String::new(),
    }
}

fn build_alternate(candidate: &RankedNativeCandidate) -> NativeLyricsAlternate {
    NativeLyricsAlternate {
        provider_id: provider_id(candidate.candidate.source).into(),
        id: candidate
            .candidate
            .source_id
            .clone()
            .unwrap_or_else(|| candidate.candidate.track.clone()),
        track_name: candidate.candidate.track.clone(),
        artist_name: candidate.candidate.artist.clone(),
        synced: candidate.candidate.synced,
        line_count: candidate.line_count,
        rank_score: candidate.score,
        lyrics_result: NativeLyricsResultLite {
            id: candidate
                .candidate
                .source_id
                .clone()
                .unwrap_or_else(|| candidate.candidate.track.clone()),
            provider_id: provider_id(candidate.candidate.source).into(),
            plain_lyrics: if candidate.text.trim().is_empty() {
                None
            } else {
                Some(candidate.text.clone())
            },
            synced_lyrics: candidate.candidate.synced_lyrics.clone(),
            synced: candidate.candidate.synced,
        },
    }
}

fn build_message(outcome: NativeLyricsOutcome) -> String {
    match outcome {
        NativeLyricsOutcome::Found => "Found native lyrics".into(),
        NativeLyricsOutcome::Instrumental => "Song appears instrumental".into(),
        NativeLyricsOutcome::LowConfidence => "Found weak native lyrics".into(),
        NativeLyricsOutcome::NotFound => "No native lyrics found".into(),
    }
}

pub fn build_native_lyrics_result(
    candidates: &[LyricsCandidate],
    input: &LyricsInput,
    video_id: &str,
    preferred_language: Option<&str>,
) -> NativeLyricsResult {
    let ranked = rank_candidates(candidates, input, preferred_language);
    let text_candidates = ranked
        .iter()
        .filter(|candidate| {
            !candidate.candidate.instrumental
                && !candidate.text.trim().is_empty()
                && !looks_like_junk(&candidate.text)
        })
        .collect::<Vec<_>>();
    let instrumental_candidates = ranked
        .iter()
        .filter(|candidate| candidate.candidate.instrumental)
        .collect::<Vec<_>>();

    if let Some(best) = text_candidates.first() {
        let mut result = build_selected(best, input);
        result.video_id = video_id.to_owned();
        result.message = build_message(result.outcome);
        result.alternates = text_candidates
            .iter()
            .skip(1)
            .take(4)
            .copied()
            .map(build_alternate)
            .collect();
        return result;
    }

    if let Some(best) = instrumental_candidates.first() {
        return NativeLyricsResult {
            outcome: NativeLyricsOutcome::Instrumental,
            video_id: video_id.to_owned(),
            title: input.track.clone(),
            author: input.artist.clone(),
            duration: best.candidate.duration.or(input.duration),
            provider_id: Some(provider_id(best.candidate.source).into()),
            id: best.candidate.source_id.clone(),
            track_name: Some(best.candidate.track.clone()),
            artist_name: Some(best.candidate.artist.clone()),
            plain_lyrics: None,
            synced_lyrics: None,
            synced: false,
            approximate_timing: false,
            lines: Vec::new(),
            score: Some(best.score),
            confidence: Some(best.confidence),
            scoring_reasons: best.scoring_reasons.clone(),
            alternates: instrumental_candidates
                .iter()
                .skip(1)
                .take(4)
                .copied()
                .map(build_alternate)
                .collect(),
            message: build_message(NativeLyricsOutcome::Instrumental),
        };
    }

    NativeLyricsResult {
        outcome: NativeLyricsOutcome::NotFound,
        video_id: video_id.to_owned(),
        title: input.track.clone(),
        author: input.artist.clone(),
        duration: input.duration,
        provider_id: None,
        id: None,
        track_name: None,
        artist_name: None,
        plain_lyrics: None,
        synced_lyrics: None,
        synced: false,
        approximate_timing: false,
        lines: Vec::new(),
        score: None,
        confidence: Some(0),
        scoring_reasons: Vec::new(),
        alternates: ranked.iter().take(4).map(build_alternate).collect(),
        message: build_message(NativeLyricsOutcome::NotFound),
    }
}

impl PartialEq for RankedNativeCandidate {
    fn eq(&self, other: &Self) -> bool {
        self.score == other.score
            && self.confidence == other.confidence
            && self.candidate == other.candidate
    }
}

impl Eq for RankedNativeCandidate {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::collections::HashMap;

    fn candidate(
        source: LyricsSource,
        synced: bool,
        plain_lyrics: &str,
        synced_lyrics: Option<&str>,
    ) -> LyricsCandidate {
        LyricsCandidate {
            source,
            source_id: Some("1".into()),
            artist: "Artist".into(),
            track: "Song".into(),
            duration: Some(180.0),
            plain_lyrics: plain_lyrics.into(),
            synced_lyrics: synced_lyrics.map(str::to_owned),
            synced,
            instrumental: false,
            diagnostics: Vec::new(),
        }
    }

    #[test]
    fn parses_synced_lrc_into_timed_lines() {
        let input = LyricsInput {
            artist: "Artist".into(),
            track: "Song".into(),
            duration: Some(20.0),
        };
        let result = build_native_lyrics_result(
            &[candidate(
                LyricsSource::LrclibExact,
                true,
                "One\nTwo\nThree\nFour",
                Some("[00:00.00] One\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four"),
            )],
            &input,
            "video-1",
            Some("en"),
        );
        assert_eq!(result.outcome, NativeLyricsOutcome::Found);
        assert_eq!(result.lines.len(), 4);
        assert_eq!(result.lines[0].start_ms, 0);
        assert_eq!(result.lines[0].end_ms, 5_000);
        assert!(!result.lines[0].approximate);
        assert!(result
            .scoring_reasons
            .iter()
            .any(|reason| reason.code == "synced_lrc"));
    }

    #[test]
    fn plain_lyrics_get_explicit_approximate_timing() {
        let input = LyricsInput {
            artist: "天音かなた".into(),
            track: "別世界".into(),
            duration: Some(246.0),
        };
        let result = build_native_lyrics_result(
            &[candidate(
                LyricsSource::LyricsOvh,
                false,
                "作詞の空白を埋めるみたいに\n遠い遠い別世界まで\n君の声が聞こえる\nもう一度会えるなら",
                None,
            )],
            &input,
            "video-2",
            Some("ja"),
        );
        assert_eq!(result.outcome, NativeLyricsOutcome::Found);
        assert_eq!(result.lines.len(), 4);
        assert!(result.lines.iter().all(|line| line.approximate));
        assert!(result.lines[0].end_ms > result.lines[0].start_ms);
        assert_eq!(result.lines.last().unwrap().end_ms, 246_000);
    }

    #[test]
    fn low_confidence_and_not_found_stay_distinct() {
        let input = LyricsInput {
            artist: "Artist".into(),
            track: "Song".into(),
            duration: Some(180.0),
        };
        let low = build_native_lyrics_result(
            &[candidate(LyricsSource::Genius, false, "Hi", None)],
            &input,
            "video-3",
            Some("en"),
        );
        assert_eq!(low.outcome, NativeLyricsOutcome::LowConfidence);

        let not_found = build_native_lyrics_result(&[], &input, "video-4", Some("en"));
        assert_eq!(not_found.outcome, NativeLyricsOutcome::NotFound);
    }

    #[test]
    fn instrumental_stays_separate_from_not_found() {
        let input = LyricsInput {
            artist: "Artist".into(),
            track: "Song".into(),
            duration: Some(180.0),
        };
        let result = build_native_lyrics_result(
            &[LyricsCandidate {
                source: LyricsSource::LrclibExact,
                source_id: Some("inst".into()),
                artist: "Artist".into(),
                track: "Song".into(),
                duration: Some(180.0),
                plain_lyrics: String::new(),
                synced_lyrics: None,
                synced: false,
                instrumental: true,
                diagnostics: Vec::new(),
            }],
            &input,
            "video-5",
            Some("en"),
        );
        assert_eq!(result.outcome, NativeLyricsOutcome::Instrumental);
    }

    #[test]
    fn native_result_serializes_score_components() {
        let input = LyricsInput {
            artist: "Artist".into(),
            track: "Song".into(),
            duration: Some(180.0),
        };
        let result = build_native_lyrics_result(
            &[candidate(
                LyricsSource::LrclibExact,
                true,
                "One\nTwo\nThree\nFour",
                Some("[00:00.00] One\n[00:05.00] Two\n[00:10.00] Three\n[00:15.00] Four"),
            )],
            &input,
            "video-6",
            Some("en"),
        );
        let json = serde_json::to_value(result).expect("json");
        assert_eq!(json["outcome"], "found");
        assert!(json["scoringReasons"].is_array());
        assert!(json["alternates"].is_array());
    }

    #[derive(Debug, Deserialize)]
    struct ReferenceTrack {
        #[serde(rename = "videoId")]
        video_id: String,
        artist: String,
        track: String,
        language: String,
        #[serde(rename = "minLines")]
        min_lines: usize,
        #[serde(rename = "mustContain")]
        must_contain: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    struct ReferenceResponse {
        #[serde(rename = "plainLyrics")]
        plain_lyrics: Option<String>,
        #[serde(rename = "syncedLyrics")]
        synced_lyrics: Option<String>,
    }

    #[test]
    fn reference_track_fixtures_produce_expected_native_results() {
        let tracks = serde_json::from_str::<Vec<ReferenceTrack>>(include_str!(
            "../../../../tests/fixtures/reference-tracks.json"
        ))
        .expect("reference tracks");
        let responses = serde_json::from_str::<HashMap<String, ReferenceResponse>>(include_str!(
            "../../../../tests/fixtures/lyrics-pipeline/reference-responses.json"
        ))
        .expect("reference responses");

        let duration_by_video = HashMap::from([
            ("Ktk_EDLDPeY", 246.0),
            ("fJ9rUzIMcZQ", 355.0),
            ("kXYiU_JCYtU", 187.0),
            ("kJQP7kiw5Fk", 229.0),
            ("9bZkp7q19f0", 253.0),
            ("dQw4w9WgXcQ", 214.0),
        ]);

        for track in tracks {
            let response = responses.get(&track.video_id).expect("fixture response");
            let candidate = LyricsCandidate {
                source: if response.synced_lyrics.is_some() {
                    LyricsSource::LrclibExact
                } else {
                    LyricsSource::LyricsOvh
                },
                source_id: Some(track.video_id.clone()),
                artist: track.artist.clone(),
                track: track.track.clone(),
                duration: Some(
                    *duration_by_video
                        .get(track.video_id.as_str())
                        .expect("duration"),
                ),
                plain_lyrics: response.plain_lyrics.clone().unwrap_or_default(),
                synced_lyrics: response.synced_lyrics.clone(),
                synced: response.synced_lyrics.is_some(),
                instrumental: false,
                diagnostics: Vec::new(),
            };
            let input = LyricsInput {
                artist: track.artist.clone(),
                track: track.track.clone(),
                duration: Some(
                    *duration_by_video
                        .get(track.video_id.as_str())
                        .expect("duration"),
                ),
            };

            let result = build_native_lyrics_result(
                &[candidate],
                &input,
                &track.video_id,
                Some(&track.language),
            );

            assert_eq!(result.outcome, NativeLyricsOutcome::Found);
            assert!(result.lines.len() >= track.min_lines, "{}", track.video_id);
            let text = result
                .plain_lyrics
                .clone()
                .unwrap_or_default()
                .to_lowercase();
            assert!(
                track
                    .must_contain
                    .iter()
                    .all(|needle| text.contains(&needle.to_lowercase())),
                "{}",
                track.video_id
            );
            if response.synced_lyrics.is_some() {
                assert!(!result.approximate_timing);
                assert!(result.synced);
            } else {
                assert!(result.approximate_timing);
                assert!(!result.synced);
            }
        }
    }
}
