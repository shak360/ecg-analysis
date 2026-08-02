//! Reading PTB-XL records, for tests that run the engine over real ECGs.
//!
//! Only the slice of WFDB that PTB-XL actually uses: format 16, one `.dat` per
//! record, all channels interleaved. That is deliberately narrow — a general
//! WFDB reader is a project of its own, and every format this does not
//! understand it refuses rather than misreads.
//!
//! These tests are skipped unless `data/ptbxl/` has been populated by
//! `npm run fetch:ptbxl`. The corpus is 1.7 GB in full and is never committed.

#![allow(dead_code)]

use std::path::{Path, PathBuf};

/// PTB-XL names the augmented leads in capitals; the engine uses the clinical
/// spelling everywhere else, and a mismatch here would silently drop three leads.
fn canonical_lead(name: &str) -> String {
    match name.to_ascii_uppercase().as_str() {
        "AVR" => "aVR".into(),
        "AVL" => "aVL".into(),
        "AVF" => "aVF".into(),
        other => other.into(),
    }
}

pub struct Record {
    pub fs_hz: f64,
    pub n_samples: usize,
    /// Lead name to millivolts, in the order the header declared them.
    pub leads: Vec<(String, Vec<f32>)>,
}

impl Record {
    pub fn lead(&self, name: &str) -> Option<&[f32]> {
        self.leads.iter().find(|(l, _)| l == name).map(|(_, v)| v.as_slice())
    }

    /// Sample times, shared by every lead since all twelve are simultaneous.
    pub fn times(&self) -> Vec<f64> {
        (0..self.n_samples).map(|i| i as f64 / self.fs_hz).collect()
    }
}

/// Where the fetched corpus lives, relative to the crate.
pub fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/ptbxl")
}

pub fn corpus_available() -> bool {
    corpus_dir().join("serial-pairs.json").exists()
}

/// Parse one PTB-XL record given its `.hea` path.
pub fn read_record(hea: &Path) -> Result<Record, String> {
    let text = std::fs::read_to_string(hea).map_err(|e| format!("{}: {e}", hea.display()))?;
    let mut lines = text.lines().filter(|l| !l.starts_with('#') && !l.trim().is_empty());

    let head: Vec<&str> = lines.next().ok_or("empty header")?.split_whitespace().collect();
    if head.len() < 4 {
        return Err(format!("malformed header line: {head:?}"));
    }
    let n_sig: usize = head[1].parse().map_err(|_| "bad signal count")?;
    let fs_hz: f64 = head[2].parse().map_err(|_| "bad sample rate")?;
    let n_samples: usize = head[3].parse().map_err(|_| "bad sample count")?;

    struct Sig {
        gain: f32,
        baseline: f32,
        name: String,
    }
    let mut sigs = Vec::with_capacity(n_sig);
    let mut dat_name = String::new();

    for _ in 0..n_sig {
        let l = lines.next().ok_or("header ended early")?;
        let f: Vec<&str> = l.split_whitespace().collect();
        if f.len() < 2 {
            return Err(format!("malformed signal line: {l}"));
        }
        if f[1] != "16" {
            return Err(format!("only WFDB format 16 is supported, got {}", f[1]));
        }
        dat_name = f[0].to_string();

        // `gain(baseline)/units`, e.g. `1000.0(0)/mV`. Baseline and units are
        // both optional in the standard; PTB-XL always writes them.
        let spec = f.get(2).copied().unwrap_or("1");
        let (gain_s, rest) = spec.split_once('(').unwrap_or((spec, "0)"));
        let baseline_s = rest.split(')').next().unwrap_or("0");
        let gain: f32 = gain_s.parse().unwrap_or(200.0);
        let baseline: f32 = baseline_s.parse().unwrap_or(0.0);
        if gain == 0.0 {
            return Err("zero gain would make every amplitude infinite".into());
        }
        // Units must be millivolts; anything else and the numbers would be
        // wrong by an unknown factor rather than obviously broken.
        if !spec.is_empty() && spec.contains('/') && !spec.ends_with("/mV") {
            return Err(format!("expected millivolts, got {spec}"));
        }

        let name = canonical_lead(f.last().copied().unwrap_or("?"));
        sigs.push(Sig { gain, baseline, name });
    }

    let dat = hea.with_file_name(&dat_name);
    let raw = std::fs::read(&dat).map_err(|e| format!("{}: {e}", dat.display()))?;
    let expected = n_samples * n_sig * 2;
    if raw.len() < expected {
        return Err(format!(
            "{}: {} bytes, expected {expected} for {n_samples} x {n_sig}",
            dat.display(),
            raw.len()
        ));
    }

    let mut leads: Vec<(String, Vec<f32>)> =
        sigs.iter().map(|s| (s.name.clone(), Vec::with_capacity(n_samples))).collect();

    for i in 0..n_samples {
        for (c, s) in sigs.iter().enumerate() {
            let k = (i * n_sig + c) * 2;
            let adu = i16::from_le_bytes([raw[k], raw[k + 1]]) as f32;
            leads[c].1.push((adu - s.baseline) / s.gain);
        }
    }

    Ok(Record { fs_hz, n_samples, leads })
}

/// Read a record by PTB-XL `ecg_id`.
pub fn read_by_id(ecg_id: u32) -> Result<Record, String> {
    let name = format!("{ecg_id:05}_hr");
    read_record(&corpus_dir().join("records500").join(format!("{name}.hea")))
}

/// Every record present in the local corpus, by ecg_id.
///
/// Reads the directory rather than an index, so it covers whatever has been
/// fetched — serial pairs, atlas cases, or both.
pub fn all_record_ids() -> Vec<u32> {
    let dir = corpus_dir().join("records500");
    let Ok(rd) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out: Vec<u32> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let stem = name.strip_suffix(".hea")?;
            stem.strip_suffix("_hr")?.parse::<u32>().ok()
        })
        .collect();
    out.sort_unstable();
    out.dedup();
    out
}

/// One serial pair from the fetch tool's index.
#[derive(Debug, Clone)]
pub struct Pair {
    pub patient: String,
    pub before: u32,
    pub after: u32,
    /// `appeared`, `resolved` or `unchanged`.
    pub kind: String,
    pub change: Vec<String>,
    pub device_changed: bool,
}

/// Load the pair index.
///
/// Hand-parsed rather than pulling in a JSON dependency for one test-only file;
/// the shape is fixed by `tools/fetch-ptbxl.ts` and pretty-printed one field per
/// line, so this stays small and obvious.
pub fn load_pairs() -> Vec<Pair> {
    let path = corpus_dir().join("serial-pairs.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };

    let field = |block: &str, key: &str| -> Option<String> {
        let at = block.find(&format!("\"{key}\""))?;
        let rest = &block[at + key.len() + 2..];
        let colon = rest.find(':')?;
        let val = rest[colon + 1..].trim_start();
        Some(if let Some(stripped) = val.strip_prefix('"') {
            stripped[..stripped.find('"')?].to_string()
        } else {
            val.split([',', '\n', '}'])
                .next()?
                .trim()
                .to_string()
        })
    };

    let mut out = Vec::new();
    for block in text.split('{').skip(1) {
        let Some(before) = field(block, "before").and_then(|s| s.parse().ok()) else {
            continue;
        };
        let Some(after) = field(block, "after").and_then(|s| s.parse().ok()) else {
            continue;
        };
        let change = block
            .split_once("\"change\"")
            .and_then(|(_, r)| r.split_once('['))
            .and_then(|(_, r)| r.split_once(']'))
            .map(|(inner, _)| {
                inner
                    .split(',')
                    .filter_map(|s| {
                        let s = s.trim().trim_matches('"');
                        (!s.is_empty()).then(|| s.to_string())
                    })
                    .collect()
            })
            .unwrap_or_default();
        out.push(Pair {
            patient: field(block, "patient").unwrap_or_default(),
            before,
            after,
            kind: field(block, "kind").unwrap_or_default(),
            change,
            device_changed: field(block, "deviceChanged").as_deref() == Some("true"),
        });
    }
    out
}

/// Build a study from a PTB-XL record.
///
/// All twelve leads are simultaneous here, unlike a 3x4 printout where each
/// panel covers a different 2.5 s window. So every lead goes in at offset zero
/// and the rhythm strip is lead II at full length — which makes this a cleaner
/// test of the engine than the fixtures are, because no panel-offset inference
/// is involved at all.
pub fn build_study(rec: &Record) -> Option<ecg_core::StudyAnalysis> {
    let t = rec.times();
    let mut b = ecg_core::StudyBuilder::new();
    let mut added = 0;
    for (name, v) in &rec.leads {
        b.add_lead(name, &t, v, 0.0);
        added += 1;
    }
    if added == 0 {
        return None;
    }
    if let Some(ii) = rec.lead("II") {
        b.set_rhythm(&t, ii);
    }
    Some(b.analyze(true))
}
