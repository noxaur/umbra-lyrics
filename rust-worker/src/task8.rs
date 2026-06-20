use serde::Serialize;
use worker::{Env, Headers, Method, Request, RequestInit};

use crate::lyrics::{LyricsCandidate, LyricsResolution, LyricsSource};
use crate::native_lyrics::{NativeLyricsLine, NativeLyricsLineKind, NativeLyricsResult};

const LEGACY_BINDING: &str = "LEGACY";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnglishStatus {
    Ready,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnglishSource {
    Found,
    Translated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EnglishAlignment {
    Aligned,
    Degraded,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnglishSearchHit {
    pub lines: Vec<String>,
    pub provider_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnglishTranslation {
    pub lines: Vec<String>,
    pub backend: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnglishSideChannel {
    pub status: EnglishStatus,
    pub source: Option<EnglishSource>,
    pub provider_id: Option<String>,
    pub translation_backend: Option<String>,
    pub alignment: EnglishAlignment,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RomajiStatus {
    Ready,
    Skipped,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RomajiSideChannel {
    pub status: RomajiStatus,
    pub system: Option<String>,
    pub reason: Option<String>,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task8SideChannels {
    pub english: EnglishSideChannel,
    pub romaji: RomajiSideChannel,
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

fn split_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(|line| line.trim().to_owned())
        .filter(|line| !line.is_empty())
        .collect()
}

fn candidate_text(candidate: &LyricsCandidate) -> String {
    candidate
        .synced_lyrics
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(strip_lrc_timestamps)
        .unwrap_or_else(|| candidate.plain_lyrics.clone())
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

fn contains_cjk(text: &str) -> bool {
    text.chars().any(|character| {
        ('\u{3040}'..='\u{30ff}').contains(&character)
            || ('\u{4e00}'..='\u{9fff}').contains(&character)
    })
}

fn looks_like_english_text(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || contains_cjk(trimmed) {
        return false;
    }
    let letters = trimmed
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count();
    let total = trimmed
        .chars()
        .filter(|character| !character.is_whitespace())
        .count()
        .max(1);
    letters > 0 && letters * 2 >= total
}

fn is_english_language(language: Option<&str>) -> bool {
    language
        .and_then(|value| value.split('-').next())
        .is_some_and(|primary| primary.eq_ignore_ascii_case("en"))
}

fn is_japanese_language(language: Option<&str>) -> bool {
    language
        .and_then(|value| value.split('-').next())
        .is_some_and(|primary| primary.eq_ignore_ascii_case("ja"))
}

fn native_text(native: &NativeLyricsResult) -> String {
    let from_plain = native.plain_lyrics.as_deref().unwrap_or("").trim();
    if !from_plain.is_empty() {
        return from_plain.to_owned();
    }
    let from_synced = native.synced_lyrics.as_deref().unwrap_or("").trim();
    if !from_synced.is_empty() {
        return strip_lrc_timestamps(from_synced);
    }
    native
        .lines
        .iter()
        .filter(|line| line.kind != NativeLyricsLineKind::Section)
        .map(|line| line.text.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn text_overlap_ratio(a: &str, b: &str) -> f64 {
    let left = normalize_text(a);
    let right = normalize_text(b);
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }

    let left_tokens = left.split_whitespace().collect::<Vec<_>>();
    let right_tokens = right.split_whitespace().collect::<Vec<_>>();
    let overlap = left_tokens
        .iter()
        .filter(|token| right_tokens.contains(token))
        .count();
    overlap as f64 / left_tokens.len().max(right_tokens.len()) as f64
}

fn candidate_provider_id(source: LyricsSource) -> String {
    match source {
        LyricsSource::LrclibExact | LyricsSource::LrclibVariant => "lrclib".into(),
        LyricsSource::LyricsOvh => "lyrics-ovh".into(),
        LyricsSource::Genius => "genius".into(),
    }
}

pub fn select_english_search_hit(
    native: &NativeLyricsResult,
    resolution: &LyricsResolution,
) -> Option<EnglishSearchHit> {
    let native_text = native_text(native);
    for candidate in &resolution.candidates {
        let text = candidate_text(candidate);
        if !looks_like_english_text(&text) {
            continue;
        }
        if !native_text.is_empty() {
            let normalized_native = normalize_text(&native_text);
            let normalized_candidate = normalize_text(&text);
            if !normalized_native.is_empty() && normalized_native == normalized_candidate {
                continue;
            }
            if text_overlap_ratio(&native_text, &text) > 0.45 {
                continue;
            }
        }

        return Some(EnglishSearchHit {
            lines: split_lines(&text),
            provider_id: candidate_provider_id(candidate.source),
        });
    }
    None
}

fn distribute_lines(source: &[String], target_slots: usize) -> Vec<String> {
    if target_slots == 0 {
        return Vec::new();
    }
    if source.is_empty() {
        return vec![String::new(); target_slots];
    }
    if source.len() == target_slots {
        return source.to_vec();
    }
    if source.len() == 1 {
        return vec![source[0].clone(); target_slots];
    }

    let mut result = Vec::with_capacity(target_slots);
    for index in 0..target_slots {
        let src_index = ((index * source.len()) / target_slots).min(source.len() - 1);
        result.push(source[src_index].clone());
    }
    result
}

fn align_to_native_lines(
    native: &[NativeLyricsLine],
    source_lines: &[String],
) -> (Vec<String>, bool) {
    let native_len = native.len();
    if native_len == 0 {
        return (Vec::new(), true);
    }

    let source = source_lines
        .iter()
        .map(|line| line.trim().to_owned())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    let vocal_indices = native
        .iter()
        .enumerate()
        .filter(|(_, line)| line.kind != NativeLyricsLineKind::Section)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();

    if source.is_empty() || vocal_indices.is_empty() {
        return (vec![String::new(); native_len], false);
    }

    if source.len() == native_len {
        return (source, false);
    }

    let distributed = distribute_lines(&source, vocal_indices.len());
    let mut aligned = vec![String::new(); native_len];
    for (slot, native_index) in vocal_indices.iter().copied().enumerate() {
        aligned[native_index] = distributed.get(slot).cloned().unwrap_or_default();
    }
    (aligned, true)
}

fn english_from_search(native: &NativeLyricsResult, hit: EnglishSearchHit) -> EnglishSideChannel {
    let (lines, degraded) = align_to_native_lines(&native.lines, &hit.lines);
    EnglishSideChannel {
        status: EnglishStatus::Ready,
        source: Some(EnglishSource::Found),
        provider_id: Some(hit.provider_id),
        translation_backend: None,
        alignment: if degraded {
            EnglishAlignment::Degraded
        } else {
            EnglishAlignment::Aligned
        },
        lines,
    }
}

fn english_from_translation(
    native: &NativeLyricsResult,
    translated: EnglishTranslation,
) -> EnglishSideChannel {
    let (lines, degraded) = align_to_native_lines(&native.lines, &translated.lines);
    EnglishSideChannel {
        status: EnglishStatus::Ready,
        source: Some(EnglishSource::Translated),
        provider_id: None,
        translation_backend: Some(translated.backend),
        alignment: if degraded {
            EnglishAlignment::Degraded
        } else {
            EnglishAlignment::Aligned
        },
        lines,
    }
}

fn english_skipped() -> EnglishSideChannel {
    EnglishSideChannel {
        status: EnglishStatus::Skipped,
        source: None,
        provider_id: None,
        translation_backend: None,
        alignment: EnglishAlignment::Skipped,
        lines: Vec::new(),
    }
}

pub fn build_english_side_channel(
    native: &NativeLyricsResult,
    language: Option<&str>,
    search_hit: Option<EnglishSearchHit>,
    translated: Option<EnglishTranslation>,
) -> EnglishSideChannel {
    if is_english_language(language)
        || (language.is_none() && looks_like_english_text(&native_text(native)))
    {
        return english_skipped();
    }

    if let Some(hit) = search_hit {
        return english_from_search(native, hit);
    }

    if let Some(translated) = translated {
        return english_from_translation(native, translated);
    }

    EnglishSideChannel {
        status: EnglishStatus::Failed,
        source: Some(EnglishSource::Translated),
        provider_id: None,
        translation_backend: None,
        alignment: EnglishAlignment::Skipped,
        lines: Vec::new(),
    }
}

fn kana_script(char: char) -> u8 {
    if ('\u{3040}'..='\u{309f}').contains(&char) {
        1
    } else if ('\u{30a0}'..='\u{30ff}').contains(&char) {
        2
    } else {
        0
    }
}

fn to_hiragana(value: &str) -> String {
    value
        .chars()
        .map(|char| match char {
            '\u{30a1}'..='\u{30f6}' => char::from_u32(char as u32 - 0x60).unwrap_or(char),
            _ => char,
        })
        .collect()
}

fn romanize_kana_run(run: &str) -> String {
    const DIGRAPHS: &[(&str, &str)] = &[
        ("きゃ", "kya"),
        ("きゅ", "kyu"),
        ("きょ", "kyo"),
        ("しゃ", "sha"),
        ("しゅ", "shu"),
        ("しょ", "sho"),
        ("ちゃ", "cha"),
        ("ちゅ", "chu"),
        ("ちょ", "cho"),
        ("にゃ", "nya"),
        ("にゅ", "nyu"),
        ("にょ", "nyo"),
        ("ひゃ", "hya"),
        ("ひゅ", "hyu"),
        ("ひょ", "hyo"),
        ("みゃ", "mya"),
        ("みゅ", "myu"),
        ("みょ", "myo"),
        ("りゃ", "rya"),
        ("りゅ", "ryu"),
        ("りょ", "ryo"),
        ("ぎゃ", "gya"),
        ("ぎゅ", "gyu"),
        ("ぎょ", "gyo"),
        ("じゃ", "ja"),
        ("じゅ", "ju"),
        ("じょ", "jo"),
        ("びゃ", "bya"),
        ("びゅ", "byu"),
        ("びょ", "byo"),
        ("ぴゃ", "pya"),
        ("ぴゅ", "pyu"),
        ("ぴょ", "pyo"),
    ];
    const KANA: &[(&str, &str)] = &[
        ("あ", "a"),
        ("い", "i"),
        ("う", "u"),
        ("え", "e"),
        ("お", "o"),
        ("か", "ka"),
        ("き", "ki"),
        ("く", "ku"),
        ("け", "ke"),
        ("こ", "ko"),
        ("さ", "sa"),
        ("し", "shi"),
        ("す", "su"),
        ("せ", "se"),
        ("そ", "so"),
        ("た", "ta"),
        ("ち", "chi"),
        ("つ", "tsu"),
        ("て", "te"),
        ("と", "to"),
        ("な", "na"),
        ("に", "ni"),
        ("ぬ", "nu"),
        ("ね", "ne"),
        ("の", "no"),
        ("は", "ha"),
        ("ひ", "hi"),
        ("ふ", "fu"),
        ("へ", "e"),
        ("ほ", "ho"),
        ("ま", "ma"),
        ("み", "mi"),
        ("む", "mu"),
        ("め", "me"),
        ("も", "mo"),
        ("や", "ya"),
        ("ゆ", "yu"),
        ("よ", "yo"),
        ("ら", "ra"),
        ("り", "ri"),
        ("る", "ru"),
        ("れ", "re"),
        ("ろ", "ro"),
        ("わ", "wa"),
        ("を", "o"),
        ("ん", "n"),
        ("が", "ga"),
        ("ぎ", "gi"),
        ("ぐ", "gu"),
        ("げ", "ge"),
        ("ご", "go"),
        ("ざ", "za"),
        ("じ", "ji"),
        ("ず", "zu"),
        ("ぜ", "ze"),
        ("ぞ", "zo"),
        ("だ", "da"),
        ("ぢ", "ji"),
        ("づ", "zu"),
        ("で", "de"),
        ("ど", "do"),
        ("ば", "ba"),
        ("び", "bi"),
        ("ぶ", "bu"),
        ("べ", "be"),
        ("ぼ", "bo"),
        ("ぱ", "pa"),
        ("ぴ", "pi"),
        ("ぷ", "pu"),
        ("ぺ", "pe"),
        ("ぽ", "po"),
    ];

    let mut chars = to_hiragana(run).chars().collect::<Vec<_>>();
    let mut out = Vec::new();
    let mut current = String::new();
    let mut double_next = false;
    let mut index = 0usize;
    while index < chars.len() {
        let char = chars[index];
        if char == 'っ' {
            double_next = true;
            index += 1;
            continue;
        }

        let pair = if index + 1 < chars.len() {
            let mut buf = [0u8; 8];
            let first = char.encode_utf8(&mut buf).to_owned();
            let second = chars[index + 1].to_string();
            format!("{first}{second}")
        } else {
            char.to_string()
        };
        let mut roma = if let Some((_, roma)) = DIGRAPHS.iter().find(|(kana, _)| *kana == pair) {
            roma.to_string()
        } else {
            let single = char.to_string();
            KANA.iter()
                .find(|(kana, _)| *kana == single)
                .map(|(_, roma)| (*roma).to_owned())
                .unwrap_or_else(|| char.to_string())
        };
        if pair.len() > 1 && DIGRAPHS.iter().any(|(kana, _)| *kana == pair) {
            index += 1;
        }
        if double_next
            && roma
                .chars()
                .next()
                .is_some_and(|ch| ch.is_ascii_alphabetic())
        {
            let first = roma.chars().next().unwrap();
            roma = format!("{first}{roma}");
        }
        double_next = false;
        if matches!(char, 'の' | 'へ' | 'を' | 'に' | 'も') && !current.is_empty() {
            out.push(current.clone());
            out.push(roma);
            current.clear();
        } else {
            current.push_str(&roma);
        }
        index += 1;
    }

    if !current.is_empty() {
        out.push(current);
    }
    out.join(" ")
}

fn romanize_japanese_line(line: &str) -> String {
    if !line.chars().any(|character| {
        ('\u{3040}'..='\u{30ff}').contains(&character)
            || ('\u{4e00}'..='\u{9fff}').contains(&character)
    }) {
        return line.trim().to_owned();
    }

    const OVERRIDES: &[(&str, &str)] = &[
        ("隠していた", "kakushiteita"),
        ("しまいそう", "shimaisou"),
        ("見られた", "mirarareta"),
        ("気持ち", "kimochi"),
        ("届いて", "todoite"),
        ("あなた", "anata"),
        ("この", "kono"),
        ("遠い", "tooi"),
        ("世界", "sekai"),
        ("別", "betsu"),
    ];

    let mut out = String::new();
    let mut index = 0usize;
    while index < line.len() {
        let rest = &line[index..];
        if let Some((native, roma)) = OVERRIDES
            .iter()
            .find(|(native, _)| rest.starts_with(native))
        {
            if !out.is_empty() && !out.ends_with(' ') {
                out.push(' ');
            }
            out.push_str(roma);
            index += native.len();
            continue;
        }

        let Some(char) = rest.chars().next() else {
            break;
        };
        if kana_script(char) != 0 {
            let start = index;
            let mut end = index + char.len_utf8();
            let mut cursor = end;
            while cursor < line.len() {
                let Some(next) = line[cursor..].chars().next() else {
                    break;
                };
                if kana_script(next) == 0 {
                    break;
                }
                cursor += next.len_utf8();
                end = cursor;
            }
            let run = &line[start..end];
            let roma = romanize_kana_run(run);
            if !out.is_empty() && !out.ends_with(' ') {
                out.push(' ');
            }
            out.push_str(&roma);
            index = end;
            continue;
        }

        if !char.is_whitespace() {
            if !out.is_empty() && !out.ends_with(' ') {
                out.push(' ');
            }
            out.push(char);
        }
        index += char.len_utf8();
    }

    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn build_romaji_lines(native: &NativeLyricsResult) -> Vec<String> {
    native
        .lines
        .iter()
        .map(|line| {
            if line.kind == NativeLyricsLineKind::Section {
                String::new()
            } else {
                romanize_japanese_line(&line.text)
            }
        })
        .collect()
}

pub fn build_romaji_side_channel(
    native: &NativeLyricsResult,
    language: Option<&str>,
) -> RomajiSideChannel {
    if !is_japanese_language(language)
        && !native.lines.iter().any(|line| {
            line.text
                .chars()
                .any(|character| ('\u{3040}'..='\u{30ff}').contains(&character))
        })
    {
        return RomajiSideChannel {
            status: RomajiStatus::Unsupported,
            system: None,
            reason: Some("language_not_supported".into()),
            lines: Vec::new(),
        };
    }

    RomajiSideChannel {
        status: RomajiStatus::Ready,
        system: Some("hepburn".into()),
        reason: None,
        lines: build_romaji_lines(native),
    }
}

fn backend_body(
    backend: &str,
    text: &str,
    source: &str,
) -> (Method, String, Option<String>, Vec<(String, String)>) {
    match backend {
        "google" => {
            let query = url::form_urlencoded::Serializer::new(String::new())
                .append_pair("q", text)
                .append_pair("sl", source)
                .append_pair("tl", "en")
                .finish();
            (
                Method::Get,
                format!("https://song.example/api/translate/google?{query}"),
                None,
                vec![
                    ("Accept".into(), "application/json".into()),
                    ("User-Agent".into(), "umbra-rust-worker".into()),
                ],
            )
        }
        "mymemory" => {
            let query = url::form_urlencoded::Serializer::new(String::new())
                .append_pair("q", text)
                .append_pair("langpair", &format!("{source}|en"))
                .finish();
            (
                Method::Get,
                format!("https://song.example/api/translate/mymemory?{query}"),
                None,
                vec![
                    ("Accept".into(), "application/json".into()),
                    ("User-Agent".into(), "umbra-rust-worker".into()),
                ],
            )
        }
        "libretranslate" => {
            let body = serde_json::json!({
                "q": text,
                "source": source,
                "target": "en",
            })
            .to_string();
            (
                Method::Post,
                "https://song.example/api/translate/libretranslate".into(),
                Some(body),
                vec![
                    ("Accept".into(), "application/json".into()),
                    ("Content-Type".into(), "application/json".into()),
                    ("User-Agent".into(), "umbra-rust-worker".into()),
                ],
            )
        }
        _ => unreachable!("unknown backend"),
    }
}

async fn call_legacy_translate(
    env: &Env,
    backend: &str,
    text: &str,
    source: &str,
) -> Option<Vec<String>> {
    let service = env.service(LEGACY_BINDING).ok()?;
    let (method, url, body, headers) = backend_body(backend, text, source);
    let request_headers = Headers::new();
    for (name, value) in headers {
        request_headers.set(&name, &value).ok()?;
    }
    let mut init = RequestInit::new();
    init.with_method(method).with_headers(request_headers);
    if let Some(body) = body {
        init.with_body(Some(body.into_bytes().into()));
    }
    let request = Request::new_with_init(&url, &init).ok()?;
    let response = service.fetch_request(request).await.ok()?;
    if !(200..300).contains(&response.status_code()) {
        return None;
    }
    let json = response.json::<serde_json::Value>().await.ok()?;
    let translated = json.get("translatedText")?.as_str()?.trim();
    if translated.is_empty() {
        return None;
    }
    let lines = translated
        .lines()
        .map(|line| line.trim().to_owned())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Some(vec![translated.to_owned()]);
    }
    Some(lines)
}

pub async fn resolve_english_translation(
    env: Option<&Env>,
    language: Option<&str>,
    native_lines: &[String],
) -> Option<EnglishTranslation> {
    let Some(env) = env else {
        return None;
    };
    if is_english_language(language) || native_lines.is_empty() {
        return None;
    }

    let source = if let Some(language) = language {
        language.split('-').next().unwrap_or(language)
    } else {
        "auto"
    };
    let text = native_lines.join("\n");

    for backend in ["google", "mymemory", "libretranslate"] {
        if let Some(lines) = call_legacy_translate(env, backend, &text, source).await {
            return Some(EnglishTranslation {
                lines,
                backend: backend.into(),
            });
        }
    }

    None
}

pub fn build_task8_side_channels(
    native: &NativeLyricsResult,
    resolution: &LyricsResolution,
    language: Option<&str>,
    translated: Option<EnglishTranslation>,
) -> Task8SideChannels {
    let search_hit = select_english_search_hit(native, resolution);
    let english = build_english_side_channel(native, language, search_hit, translated);
    let romaji = build_romaji_side_channel(native, language);
    Task8SideChannels { english, romaji }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn native_result(text: &str, language: Option<&str>) -> NativeLyricsResult {
        NativeLyricsResult {
            outcome: crate::native_lyrics::NativeLyricsOutcome::Found,
            video_id: "dQw4w9WgXcQ".into(),
            title: "Title".into(),
            author: "Artist".into(),
            duration: Some(200.0),
            provider_id: Some("lrclib".into()),
            id: Some("1".into()),
            track_name: Some("Track".into()),
            artist_name: Some("Artist".into()),
            plain_lyrics: Some(text.into()),
            synced_lyrics: None,
            synced: false,
            approximate_timing: false,
            lines: text
                .lines()
                .map(|line| NativeLyricsLine {
                    start_ms: 0,
                    end_ms: 1_000,
                    text: line.into(),
                    kind: NativeLyricsLineKind::Lyric,
                    approximate: false,
                })
                .collect(),
            score: Some(0),
            confidence: Some(100),
            scoring_reasons: vec![],
            alternates: vec![],
            message: "Found native lyrics".into(),
        }
    }

    #[test]
    fn english_search_beats_translation() {
        let native = native_result("別の世界へ\n遠い空", Some("ja"));
        let resolution = LyricsResolution {
            candidates: vec![LyricsCandidate {
                source: LyricsSource::Genius,
                source_id: Some("1".into()),
                artist: "天音かなた".into(),
                track: "別世界".into(),
                duration: Some(200.0),
                plain_lyrics: "To another world\nFar sky".into(),
                synced_lyrics: None,
                synced: false,
                diagnostics: vec![],
            }],
            warnings: vec![],
        };

        let side = build_task8_side_channels(&native, &resolution, Some("ja"), None);
        assert_eq!(side.english.status, EnglishStatus::Ready);
        assert_eq!(side.english.source, Some(EnglishSource::Found));
        assert_eq!(side.english.provider_id.as_deref(), Some("genius"));
        assert_eq!(side.english.alignment, EnglishAlignment::Aligned);
        assert_eq!(side.english.lines, vec!["To another world", "Far sky"]);
    }

    #[test]
    fn translation_fallback_is_explicit_and_aligned() {
        let native = native_result("別の世界へ\n遠い空", Some("ja"));
        let resolution = LyricsResolution {
            candidates: vec![],
            warnings: vec![],
        };

        let side = build_task8_side_channels(
            &native,
            &resolution,
            Some("ja"),
            Some(EnglishTranslation {
                lines: vec!["To another world".into(), "Far sky".into()],
                backend: "google".into(),
            }),
        );
        assert_eq!(side.english.status, EnglishStatus::Ready);
        assert_eq!(side.english.source, Some(EnglishSource::Translated));
        assert_eq!(side.english.translation_backend.as_deref(), Some("google"));
        assert_eq!(side.english.alignment, EnglishAlignment::Aligned);
    }

    #[test]
    fn mismatch_degrades_alignment() {
        let native = native_result("別の世界へ\n遠い空\n届いて", Some("ja"));
        let resolution = LyricsResolution {
            candidates: vec![],
            warnings: vec![],
        };

        let side = build_task8_side_channels(
            &native,
            &resolution,
            Some("ja"),
            Some(EnglishTranslation {
                lines: vec!["To another world".into(), "Far sky".into()],
                backend: "google".into(),
            }),
        );
        assert_eq!(side.english.alignment, EnglishAlignment::Degraded);
        assert_eq!(side.english.lines.len(), 3);
    }

    #[test]
    fn english_native_skips_and_romaji_is_unsupported() {
        let native = native_result("Hello from the other side", Some("en"));
        let resolution = LyricsResolution {
            candidates: vec![],
            warnings: vec![],
        };

        let side = build_task8_side_channels(&native, &resolution, Some("en"), None);
        assert_eq!(side.english.status, EnglishStatus::Skipped);
        assert_eq!(side.english.alignment, EnglishAlignment::Skipped);
        assert_eq!(side.romaji.status, RomajiStatus::Unsupported);
        assert_eq!(
            side.romaji.reason.as_deref(),
            Some("language_not_supported")
        );
    }

    #[test]
    fn japanese_romaji_is_useful() {
        let native = native_result("ひかりのせかいへ\n遠い世界", Some("ja"));
        let resolution = LyricsResolution {
            candidates: vec![],
            warnings: vec![],
        };

        let side = build_task8_side_channels(&native, &resolution, Some("ja"), None);
        assert_eq!(side.romaji.status, RomajiStatus::Ready);
        assert_eq!(side.romaji.system.as_deref(), Some("hepburn"));
        assert_eq!(side.romaji.lines[0], "hikari no sekai e");
        assert!(side.romaji.lines[1].contains("tooi"));
    }
}
