//! Getting an extracted trace onto the canonical 500 Hz grid.
//!
//! Three stages, in order, each with a specific failure it exists to prevent:
//!
//! 1. [`column_envelope`] — collapse the multi-valued geometry of a steep stroke
//!    to one value per column. Averaging here halves the R amplitude on the
//!    steepest columns, so the envelope is taken and continuity decides.
//! 2. [`pchip_uniform`] — irregular vertices onto a uniform intermediate grid.
//!    PCHIP, never a natural cubic spline: a spline overshoots the R peak and
//!    rings into early ST, fabricating ST deviation out of nothing.
//! 3. [`resample`] — Kaiser windowed-sinc rate conversion to 500 Hz, with the
//!    transient-contaminated ends reported rather than reflect-padded.
//!
//! Amplitudes are millivolts throughout; time is seconds.

use crate::config::{
    PCHIP_GAP_MAX_MS, RESAMP_ATTEN_DB, RESAMP_FC_CAP_HZ, RESAMP_FC_FRAC, RESAMP_TABLE_LEN,
    RESAMP_ZERO_CROSSINGS,
};

/// Per-sample provenance. A measurement that overlaps anything other than
/// `CLEAN` must not be reported as a number.
pub mod flags {
    /// Sample is backed by real extracted geometry.
    pub const CLEAN: u8 = 0;
    /// Sample was bridged across a gap wider than `PCHIP_GAP_MAX_MS`.
    pub const INTERPOLATED: u8 = 1 << 0;
    /// Sample lies within the resampler's edge transient.
    pub const EDGE: u8 = 1 << 1;
}

/// One vertex of an extracted trace: irregular in time, millivolts in amplitude.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vertex {
    pub t_s: f64,
    pub v_mv: f32,
}

/// A signal on a uniform grid, with per-sample provenance.
#[derive(Debug, Clone)]
pub struct Uniform {
    pub v_mv: Vec<f32>,
    pub flags: Vec<u8>,
    pub fs_hz: f64,
    /// Time of `v_mv[0]`.
    pub t0_s: f64,
}

impl Uniform {
    pub fn len(&self) -> usize {
        self.v_mv.len()
    }

    pub fn is_empty(&self) -> bool {
        self.v_mv.is_empty()
    }

    /// Samples whose flags are exactly `CLEAN`.
    pub fn clean_count(&self) -> usize {
        self.flags.iter().filter(|&&f| f == flags::CLEAN).count()
    }
}

// ---------------------------------------------------------------------------
// Stage 1 — column envelope
// ---------------------------------------------------------------------------

/// Running state for one column of the envelope pass.
#[derive(Clone, Copy)]
struct Column {
    idx: i64,
    lo: f32,
    hi: f32,
    /// First and last values in *path* order, which is what distinguishes a
    /// monotonic pass-through from a turning point.
    entry: f32,
    exit: f32,
}

/// Collapse trace geometry to one vertex per column of `dt_s`.
///
/// A polyline crossing a column during a steep QRS stroke contributes many y
/// values to that column. Their mean is not the signal — it is roughly half the
/// excursion, which is exactly how an R wave loses amplitude.
///
/// The envelope alone is not enough to decide either, because at the apex column
/// the incoming sample can coincide with one end of the envelope. What settles it
/// is whether the trace *turned around* inside the column, which the entry and
/// exit values reveal:
///
/// * `hi` above both entry and exit ⇒ the trace peaked in this column ⇒ emit `hi`;
/// * `lo` below both ⇒ it troughed here ⇒ emit `lo`;
/// * otherwise it passed through monotonically ⇒ emit the entry/exit midpoint,
///   which is the value at the column's centre without amplifying noise.
///
/// On a flat segment, where clinical measurements are actually taken, entry,
/// exit, `lo` and `hi` all coincide and the rule is inert. Where the trace merely
/// wiggles within a column, the emitted value departs from the midpoint by
/// exactly the size of that wiggle — so noise is never amplified, only preserved.
///
/// `max_slope_mv_per_s` clamps the sample-to-sample excursion. It guards against
/// a merged neighbouring lead yanking the trace; it is not a filter, so set it
/// generously (the steepest physiological slope is around 75 mV/s).
pub fn column_envelope(vertices: &[Vertex], dt_s: f64, max_slope_mv_per_s: f32) -> Vec<Vertex> {
    assert!(dt_s > 0.0, "column width must be positive");
    if vertices.is_empty() {
        return Vec::new();
    }

    let t_start = vertices[0].t_s;
    let mut out: Vec<Vertex> = Vec::new();
    let mut prev_out: Option<f32> = None;

    let emit = |c: Column, prev: &mut Option<f32>, out: &mut Vec<Vertex>| {
        let outer_hi = c.entry.max(c.exit);
        let outer_lo = c.entry.min(c.exit);
        let peak_excursion = c.hi - outer_hi;
        let trough_excursion = outer_lo - c.lo;

        let pick = if peak_excursion > trough_excursion && peak_excursion > 0.0 {
            c.hi
        } else if trough_excursion > 0.0 {
            c.lo
        } else {
            0.5 * (c.entry + c.exit)
        };

        let value = match *prev {
            Some(p) => {
                let max_step = max_slope_mv_per_s * dt_s as f32;
                let step = pick - p;
                if step.abs() > max_step {
                    p + max_step * step.signum()
                } else {
                    pick
                }
            }
            None => pick,
        };

        *prev = Some(value);
        out.push(Vertex {
            t_s: t_start + (c.idx as f64 + 0.5) * dt_s,
            v_mv: value,
        });
    };

    let v0 = vertices[0];
    let mut cur = Column {
        idx: ((v0.t_s - t_start) / dt_s).floor() as i64,
        lo: v0.v_mv,
        hi: v0.v_mv,
        entry: v0.v_mv,
        exit: v0.v_mv,
    };

    for v in &vertices[1..] {
        let idx = ((v.t_s - t_start) / dt_s).floor() as i64;
        if idx == cur.idx {
            cur.lo = cur.lo.min(v.v_mv);
            cur.hi = cur.hi.max(v.v_mv);
            cur.exit = v.v_mv;
        } else {
            emit(cur, &mut prev_out, &mut out);
            // Columns the trace skipped entirely are simply absent; the gap is
            // detected downstream by PCHIP_GAP_MAX_MS rather than invented here.
            cur = Column { idx, lo: v.v_mv, hi: v.v_mv, entry: v.v_mv, exit: v.v_mv };
        }
    }
    emit(cur, &mut prev_out, &mut out);

    out
}

// ---------------------------------------------------------------------------
// Stage 2 — PCHIP onto a uniform intermediate grid
// ---------------------------------------------------------------------------

/// Fritsch–Carlson slope limiting: the step that makes the interpolant
/// shape-preserving, and the reason this is not a natural cubic spline.
fn pchip_slopes(t: &[f64], y: &[f32]) -> Vec<f32> {
    let n = t.len();
    let mut m = vec![0.0f32; n];
    if n < 2 {
        return m;
    }

    let mut delta = vec![0.0f32; n - 1];
    let mut h = vec![0.0f64; n - 1];
    for i in 0..n - 1 {
        h[i] = t[i + 1] - t[i];
        delta[i] = if h[i] > 0.0 {
            ((y[i + 1] - y[i]) as f64 / h[i]) as f32
        } else {
            0.0
        };
    }

    if n == 2 {
        m[0] = delta[0];
        m[1] = delta[0];
        return m;
    }

    // Interior slopes: weighted harmonic mean, zeroed at local extrema. Zeroing
    // at extrema is what stops overshoot at the R peak.
    for i in 1..n - 1 {
        let (d0, d1) = (delta[i - 1], delta[i]);
        if d0 * d1 <= 0.0 {
            m[i] = 0.0;
        } else {
            let (h0, h1) = (h[i - 1] as f32, h[i] as f32);
            let w1 = 2.0 * h1 + h0;
            let w2 = h1 + 2.0 * h0;
            m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
        }
    }

    // One-sided ends, with the standard three-point formula and its guards.
    m[0] = end_slope(h[0] as f32, h[1] as f32, delta[0], delta[1]);
    m[n - 1] = end_slope(
        h[n - 2] as f32,
        h[n - 3] as f32,
        delta[n - 2],
        delta[n - 3],
    );

    m
}

fn end_slope(h0: f32, h1: f32, d0: f32, d1: f32) -> f32 {
    let d = ((2.0 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if d * d0 <= 0.0 {
        0.0
    } else if d0 * d1 <= 0.0 && d.abs() > (3.0 * d0).abs() {
        3.0 * d0
    } else {
        d
    }
}

/// Interpolate irregular vertices onto a uniform grid at `fs_hz`.
///
/// Spans between consecutive vertices longer than [`PCHIP_GAP_MAX_MS`] are still
/// filled — the array has to be contiguous — but every sample inside them is
/// marked [`flags::INTERPOLATED`] so measurement code can refuse them. Silently
/// filling a gap is how a clean ST number gets computed from invented geometry.
///
/// The caller is responsible for choosing `fs_hz` at or above the source
/// density; interpolating onto a coarser grid than the source aliases.
pub fn pchip_uniform(vertices: &[Vertex], fs_hz: f64) -> Uniform {
    assert!(fs_hz > 0.0, "sample rate must be positive");

    if vertices.len() < 2 {
        return Uniform {
            v_mv: Vec::new(),
            flags: Vec::new(),
            fs_hz,
            t0_s: vertices.first().map_or(0.0, |v| v.t_s),
        };
    }

    let t: Vec<f64> = vertices.iter().map(|v| v.t_s).collect();
    let y: Vec<f32> = vertices.iter().map(|v| v.v_mv).collect();
    let m = pchip_slopes(&t, &y);

    let t0 = t[0];
    let t_end = t[t.len() - 1];
    let dt = 1.0 / fs_hz;
    let n_out = ((t_end - t0) / dt).floor() as usize + 1;

    let gap_max_s = PCHIP_GAP_MAX_MS / 1000.0;
    let mut v_mv = Vec::with_capacity(n_out);
    let mut fl = Vec::with_capacity(n_out);

    let mut seg = 0usize;
    for k in 0..n_out {
        let tt = t0 + k as f64 * dt;
        while seg + 2 < t.len() && tt > t[seg + 1] {
            seg += 1;
        }

        let h = t[seg + 1] - t[seg];
        let s = if h > 0.0 { (tt - t[seg]) / h } else { 0.0 };
        let s = s.clamp(0.0, 1.0) as f32;
        let hf = h as f32;

        // Cubic Hermite basis.
        let s2 = s * s;
        let s3 = s2 * s;
        let h00 = 2.0 * s3 - 3.0 * s2 + 1.0;
        let h10 = s3 - 2.0 * s2 + s;
        let h01 = -2.0 * s3 + 3.0 * s2;
        let h11 = s3 - s2;

        v_mv.push(h00 * y[seg] + h10 * hf * m[seg] + h01 * y[seg + 1] + h11 * hf * m[seg + 1]);
        fl.push(if h > gap_max_s { flags::INTERPOLATED } else { flags::CLEAN });
    }

    Uniform { v_mv, flags: fl, fs_hz, t0_s: t0 }
}

// ---------------------------------------------------------------------------
// Stage 3 — Kaiser windowed-sinc rate conversion
// ---------------------------------------------------------------------------

/// Zeroth-order modified Bessel function of the first kind.
///
/// Series expansion; converges quickly for the β ≈ 8 the 80 dB design needs.
fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let half_x_sq = (x / 2.0) * (x / 2.0);
    for k in 1..64 {
        term *= half_x_sq / ((k * k) as f64);
        sum += term;
        if term < sum * 1e-16 {
            break;
        }
    }
    sum
}

/// Kaiser β for a target stopband attenuation, per Kaiser's design formula.
fn kaiser_beta(atten_db: f64) -> f64 {
    if atten_db > 50.0 {
        0.1102 * (atten_db - 8.7)
    } else if atten_db >= 21.0 {
        0.5842 * (atten_db - 21.0).powf(0.4) + 0.07886 * (atten_db - 21.0)
    } else {
        0.0
    }
}

/// A tabulated windowed-sinc kernel, sampled on the half-support and mirrored.
struct SincTable {
    taps: Vec<f32>,
    /// Kernel half-width, in input samples.
    half_width: f64,
    /// Table entries per input sample.
    per_input_sample: f64,
}

impl SincTable {
    /// `fc_norm` is the cutoff in cycles per input sample.
    fn new(fc_norm: f64, zero_crossings: usize, atten_db: f64, table_len: usize) -> Self {
        // The kernel spans `zero_crossings` nulls of sinc(2·fc·x), so its
        // half-width in input samples scales inversely with the cutoff.
        let half_width = zero_crossings as f64 / (2.0 * fc_norm);
        let beta = kaiser_beta(atten_db);
        let i0_beta = bessel_i0(beta);

        let mut taps = Vec::with_capacity(table_len + 2);
        for i in 0..=table_len {
            let x = half_width * (i as f64) / (table_len as f64);
            let arg = 2.0 * fc_norm * x;
            let sinc = if arg.abs() < 1e-12 {
                1.0
            } else {
                (std::f64::consts::PI * arg).sin() / (std::f64::consts::PI * arg)
            };
            let r = x / half_width;
            let w = if r >= 1.0 {
                0.0
            } else {
                bessel_i0(beta * (1.0 - r * r).sqrt()) / i0_beta
            };
            taps.push((2.0 * fc_norm * sinc * w) as f32);
        }
        // Guard entry so linear interpolation at the very end cannot index past.
        taps.push(0.0);

        SincTable {
            taps,
            half_width,
            per_input_sample: table_len as f64 / half_width,
        }
    }

    /// Kernel value at `x` input samples from the centre.
    #[inline]
    fn at(&self, x: f64) -> f32 {
        let ax = x.abs();
        if ax >= self.half_width {
            return 0.0;
        }
        let pos = ax * self.per_input_sample;
        let i = pos as usize;
        let frac = (pos - i as f64) as f32;
        let a = self.taps[i];
        let b = self.taps[i + 1];
        a + (b - a) * frac
    }
}

/// Result of a rate conversion.
#[derive(Debug, Clone)]
pub struct Resampled {
    pub v_mv: Vec<f32>,
    pub flags: Vec<u8>,
    pub fs_hz: f64,
    pub t0_s: f64,
    /// Samples at each end that sit inside the kernel's transient.
    pub edge_samples: usize,
}

/// Number of output samples at each end contaminated by the kernel running off
/// the end of the input.
///
/// Reported rather than hidden: the spec forbids reflect-padding here, because a
/// reflected QRS at the panel edge is exactly the high-amplitude artefact that a
/// downstream peak detector will happily promote to a beat.
pub fn edge_samples(f_in: f64, f_out: f64) -> usize {
    let fc = resample_cutoff_hz(f_in, f_out);
    let fc_norm = fc / f_in;
    let half_width_in = RESAMP_ZERO_CROSSINGS as f64 / (2.0 * fc_norm);
    (half_width_in * f_out / f_in).ceil() as usize
}

/// Anti-alias cutoff in Hz for a conversion, capped at the diagnostic band edge.
///
/// The `min(f_in, f_out)` handles up- and down-sampling in one expression: when
/// upsampling the input's own Nyquist binds, when downsampling the output's does.
pub fn resample_cutoff_hz(f_in: f64, f_out: f64) -> f64 {
    (RESAMP_FC_FRAC * f_in.min(f_out)).min(RESAMP_FC_CAP_HZ)
}

/// Convert a uniform signal from `src.fs_hz` to `f_out` by windowed-sinc
/// interpolation.
///
/// Flags are carried across: an output sample inherits `INTERPOLATED` if any
/// input sample within its kernel support carried it, since the kernel genuinely
/// mixes those samples in. Edge samples are additionally marked [`flags::EDGE`].
pub fn resample(src: &Uniform, f_out: f64) -> Resampled {
    assert!(f_out > 0.0, "output rate must be positive");
    let f_in = src.fs_hz;

    if src.is_empty() {
        return Resampled {
            v_mv: Vec::new(),
            flags: Vec::new(),
            fs_hz: f_out,
            t0_s: src.t0_s,
            edge_samples: 0,
        };
    }

    // Identity conversion: copying is not just faster, it avoids committing a
    // needless interpolation error.
    if (f_in - f_out).abs() < 1e-9 {
        return Resampled {
            v_mv: src.v_mv.clone(),
            flags: src.flags.clone(),
            fs_hz: f_out,
            t0_s: src.t0_s,
            edge_samples: 0,
        };
    }

    let fc_norm = resample_cutoff_hz(f_in, f_out) / f_in;
    let table = SincTable::new(
        fc_norm,
        RESAMP_ZERO_CROSSINGS,
        RESAMP_ATTEN_DB,
        RESAMP_TABLE_LEN,
    );

    let n_in = src.v_mv.len();
    let ratio = f_in / f_out; // input samples per output sample
    let n_out = (((n_in - 1) as f64) / ratio).floor() as usize + 1;

    let mut v_mv = Vec::with_capacity(n_out);
    let mut fl = Vec::with_capacity(n_out);

    let hw = table.half_width;
    for k in 0..n_out {
        let centre = k as f64 * ratio; // position in input samples
        let lo = ((centre - hw).ceil() as i64).max(0);
        let hi = ((centre + hw).floor() as i64).min(n_in as i64 - 1);

        let mut acc = 0.0f64;
        let mut wsum = 0.0f64;
        let mut f = flags::CLEAN;
        for i in lo..=hi {
            let w = table.at(centre - i as f64);
            if w == 0.0 {
                continue;
            }
            acc += (w as f64) * (src.v_mv[i as usize] as f64);
            wsum += w as f64;
            f |= src.flags[i as usize];
        }

        // Normalising by the realised weight sum corrects the DC gain when the
        // kernel is truncated at the ends, so a lead does not appear to drift
        // toward zero in its first and last samples.
        v_mv.push(if wsum.abs() > 1e-12 { (acc / wsum) as f32 } else { 0.0 });
        fl.push(f);
    }

    let edge = edge_samples(f_in, f_out).min(n_out / 2);
    for k in 0..edge {
        fl[k] |= flags::EDGE;
        let j = n_out - 1 - k;
        fl[j] |= flags::EDGE;
    }

    Resampled {
        v_mv,
        flags: fl,
        fs_hz: f_out,
        t0_s: src.t0_s,
        edge_samples: edge,
    }
}

/// Intermediate grid rate for the PCHIP stage.
///
/// Never below the source density (interpolating onto a coarser grid aliases)
/// and never below the canonical rate, rounded up to a multiple of 10 Hz so the
/// subsequent conversion ratio stays well conditioned.
pub fn intermediate_rate(f_src: f64, f_canonical: f64) -> f64 {
    let raw = f_src.max(f_canonical);
    (raw / 10.0).ceil() * 10.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    /// A QRS-like spike on a slow baseline, in millivolts.
    fn synthetic(fs: f64, dur_s: f64) -> Vec<f32> {
        let n = (fs * dur_s) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / fs;
                let mut v = 0.15 * (2.0 * std::f64::consts::PI * 1.2 * t).sin(); // P/T-ish
                for k in 0..(dur_s as usize) {
                    let dt = t - (0.5 + k as f64);
                    v += 1.4 * (-0.5 * (dt / 0.011).powi(2)).exp(); // R wave
                }
                v as f32
            })
            .collect()
    }

    fn uniform_from(v: Vec<f32>, fs: f64) -> Uniform {
        let n = v.len();
        Uniform { v_mv: v, flags: vec![flags::CLEAN; n], fs_hz: fs, t0_s: 0.0 }
    }

    fn rms(a: &[f32], b: &[f32]) -> f64 {
        assert_eq!(a.len(), b.len());
        let s: f64 = a.iter().zip(b).map(|(x, y)| ((x - y) as f64).powi(2)).sum();
        (s / a.len() as f64).sqrt()
    }

    // ---- Kaiser design -----------------------------------------------------

    #[test]
    fn bessel_i0_matches_known_values() {
        assert!((bessel_i0(0.0) - 1.0).abs() < 1e-12);
        assert!((bessel_i0(1.0) - 1.2660658777520084).abs() < 1e-10);
        assert!((bessel_i0(5.0) - 27.239871823604442).abs() < 1e-8);
    }

    #[test]
    fn kaiser_beta_for_80db() {
        assert!((kaiser_beta(80.0) - 7.857).abs() < 1e-3);
    }

    #[test]
    fn cutoff_uses_the_binding_nyquist_and_respects_the_cap() {
        // Downsampling: the output rate binds.
        assert!((resample_cutoff_hz(2000.0, 500.0) - 225.0).min(RESAMP_FC_CAP_HZ) <= 150.0);
        assert_eq!(resample_cutoff_hz(2000.0, 500.0), 150.0); // capped
        // Upsampling from a low rate: the input rate binds and sits under the cap.
        assert!((resample_cutoff_hz(295.0, 500.0) - 132.75).abs() < 1e-9);
    }

    // ---- Round trip: the spec's acceptance test ----------------------------

    #[test]
    fn round_trip_from_intermediate_rates_is_accurate() {
        // Spec §7.1: f_int in {295, 600, 2000} -> 500 Hz, RMS < 5 uV.
        for &f_int in &[295.0f64, 600.0, 2000.0] {
            let src = uniform_from(synthetic(f_int, 4.0), f_int);
            let out = resample(&src, FS);

            // Compare against the same waveform generated natively at 500 Hz,
            // over the interior only — the ends are flagged EDGE for a reason.
            let truth = synthetic(FS, 4.0);
            let e = out.edge_samples + 8;
            let n = out.v_mv.len().min(truth.len());
            assert!(n > e * 2, "not enough interior samples at f_int={f_int}");

            let err = rms(&out.v_mv[e..n - e], &truth[e..n - e]);
            assert!(
                err < 5e-3,
                "f_int={f_int}: RMS {:.6} mV exceeds 5 uV",
                err
            );
        }
    }

    #[test]
    fn resampling_does_not_overshoot_the_r_peak() {
        // Overshoot at the R peak would be read as a taller R wave, and the
        // ringing that follows it lands squarely on the ST segment.
        for &f_int in &[295.0f64, 600.0, 2000.0] {
            let src = uniform_from(synthetic(f_int, 4.0), f_int);
            let peak_in = src.v_mv.iter().cloned().fold(f32::MIN, f32::max);
            let out = resample(&src, FS);
            let e = out.edge_samples;
            let peak_out = out.v_mv[e..out.v_mv.len() - e]
                .iter()
                .cloned()
                .fold(f32::MIN, f32::max);
            assert!(
                peak_out <= peak_in * 1.02,
                "f_int={f_int}: peak grew from {peak_in} to {peak_out}"
            );
        }
    }

    #[test]
    fn identity_rate_is_a_passthrough() {
        let src = uniform_from(synthetic(500.0, 2.0), 500.0);
        let out = resample(&src, 500.0);
        assert_eq!(out.v_mv, src.v_mv);
        assert_eq!(out.edge_samples, 0);
    }

    #[test]
    fn dc_is_preserved_including_at_the_edges() {
        // Kernel truncation at the ends would pull a constant toward zero
        // without the realised-weight normalisation, which would read as
        // baseline drift in the first and last samples of every panel.
        let src = uniform_from(vec![1.0f32; 1200], 600.0);
        let out = resample(&src, FS);
        for (i, &v) in out.v_mv.iter().enumerate() {
            assert!((v - 1.0).abs() < 1e-3, "sample {i} = {v}, expected 1.0");
        }
    }

    #[test]
    fn edge_samples_are_flagged_at_both_ends() {
        let src = uniform_from(synthetic(600.0, 4.0), 600.0);
        let out = resample(&src, FS);
        assert!(out.edge_samples > 0);
        let n = out.v_mv.len();
        assert!(out.flags[0] & flags::EDGE != 0);
        assert!(out.flags[n - 1] & flags::EDGE != 0);
        assert_eq!(out.flags[n / 2] & flags::EDGE, 0);
    }

    // ---- PCHIP -------------------------------------------------------------

    #[test]
    fn pchip_passes_through_its_knots() {
        let v: Vec<Vertex> = (0..20)
            .map(|i| Vertex { t_s: i as f64 * 0.01, v_mv: (i as f32 * 0.3).sin() })
            .collect();
        let u = pchip_uniform(&v, 100.0);
        for (i, vert) in v.iter().enumerate() {
            assert!(
                (u.v_mv[i] - vert.v_mv).abs() < 1e-5,
                "knot {i}: {} vs {}",
                u.v_mv[i],
                vert.v_mv
            );
        }
    }

    #[test]
    fn pchip_does_not_overshoot_a_peak() {
        // The whole reason PCHIP was chosen over a natural cubic spline: a
        // spline overshoots here and rings into the samples after the peak,
        // which downstream is early ST.
        let v = vec![
            Vertex { t_s: 0.000, v_mv: 0.0 },
            Vertex { t_s: 0.010, v_mv: 0.0 },
            Vertex { t_s: 0.020, v_mv: 1.5 },
            Vertex { t_s: 0.030, v_mv: 0.0 },
            Vertex { t_s: 0.040, v_mv: 0.0 },
        ];
        let u = pchip_uniform(&v, 2000.0);
        let max = u.v_mv.iter().cloned().fold(f32::MIN, f32::max);
        let min = u.v_mv.iter().cloned().fold(f32::MAX, f32::min);
        assert!(max <= 1.5 + 1e-4, "overshot the peak: {max}");
        assert!(min >= -1e-4, "undershot below the flat baseline: {min}");
    }

    #[test]
    fn pchip_is_monotone_on_monotone_data() {
        let v: Vec<Vertex> = (0..10)
            .map(|i| Vertex { t_s: i as f64 * 0.01, v_mv: (i * i) as f32 * 0.01 })
            .collect();
        let u = pchip_uniform(&v, 1000.0);
        for w in u.v_mv.windows(2) {
            assert!(w[1] >= w[0] - 1e-6, "monotonicity broken: {} -> {}", w[0], w[1]);
        }
    }

    #[test]
    fn pchip_flags_wide_gaps_as_interpolated() {
        // 40 ms hole, far wider than PCHIP_GAP_MAX_MS.
        let v = vec![
            Vertex { t_s: 0.000, v_mv: 0.0 },
            Vertex { t_s: 0.002, v_mv: 0.1 },
            Vertex { t_s: 0.042, v_mv: 0.2 },
            Vertex { t_s: 0.044, v_mv: 0.3 },
        ];
        let u = pchip_uniform(&v, 500.0);
        let interp = u.flags.iter().filter(|&&f| f & flags::INTERPOLATED != 0).count();
        assert!(interp > 0, "wide gap was not flagged");
        assert!(u.clean_count() > 0, "everything was flagged");
    }

    #[test]
    fn pchip_leaves_dense_vertices_clean() {
        let v: Vec<Vertex> = (0..50)
            .map(|i| Vertex { t_s: i as f64 * 0.002, v_mv: i as f32 * 0.01 })
            .collect();
        let u = pchip_uniform(&v, 500.0);
        assert_eq!(u.clean_count(), u.len());
    }

    #[test]
    fn pchip_needs_two_vertices() {
        assert!(pchip_uniform(&[], 500.0).is_empty());
        assert!(pchip_uniform(&[Vertex { t_s: 0.0, v_mv: 1.0 }], 500.0).is_empty());
    }

    // ---- Column envelope ---------------------------------------------------

    /// A triangular R wave of `amp` mV peaking at `t_peak`, sampled densely.
    fn spike_vertices(amp: f32, t_peak: f64, half_width_s: f64, fs_src: f64) -> Vec<Vertex> {
        let n = (0.020 * fs_src) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / fs_src;
                let d = (t - t_peak).abs();
                let v = if d < half_width_s {
                    amp * (1.0 - (d / half_width_s) as f32)
                } else {
                    0.0
                };
                Vertex { t_s: t, v_mv: v }
            })
            .collect()
    }

    #[test]
    fn envelope_preserves_a_peak_that_averaging_would_halve() {
        // A dense source binned into coarser columns: the apex column holds many
        // vertices spanning most of the R wave's height. Averaging them loses the
        // peak; the turning-point rule must keep it.
        let v = spike_vertices(1.4, 0.011, 0.004, 5000.0);
        let out = column_envelope(&v, 0.002, 1000.0);
        let peak = out.iter().map(|x| x.v_mv).fold(f32::MIN, f32::max);
        assert!(peak >= 1.35, "R wave was flattened to {peak} mV, expected ~1.4");
    }

    #[test]
    fn averaging_the_apex_column_would_have_lost_amplitude() {
        // Documents the failure the rule exists to prevent, so that a future
        // "simplification" to a column mean fails visibly here.
        let v = spike_vertices(1.4, 0.011, 0.004, 5000.0);
        let in_apex: Vec<f32> = v
            .iter()
            .filter(|x| x.t_s >= 0.010 && x.t_s < 0.012)
            .map(|x| x.v_mv)
            .collect();
        let mean = in_apex.iter().sum::<f32>() / in_apex.len() as f32;
        assert!(
            mean < 1.25,
            "test is not exercising the failure: column mean {mean} is already near the peak"
        );

        let out = column_envelope(&v, 0.002, 1000.0);
        let peak = out.iter().map(|x| x.v_mv).fold(f32::MIN, f32::max);
        assert!(peak > mean + 0.1, "envelope {peak} did not beat the mean {mean}");
    }

    #[test]
    fn envelope_preserves_a_deep_s_wave_trough() {
        let v = spike_vertices(-1.1, 0.011, 0.004, 5000.0);
        let out = column_envelope(&v, 0.002, 1000.0);
        let trough = out.iter().map(|x| x.v_mv).fold(f32::MAX, f32::min);
        assert!(trough <= -1.05, "S wave was flattened to {trough} mV");
    }

    #[test]
    fn envelope_does_not_amplify_a_monotonic_ramp() {
        // A ramp passing through columns must not be pushed to the envelope ends;
        // that would add a half-column of amplitude at every sample.
        let v: Vec<Vertex> = (0..200)
            .map(|i| {
                let t = i as f64 * 0.0001;
                Vertex { t_s: t, v_mv: (t * 10.0) as f32 }
            })
            .collect();
        let out = column_envelope(&v, 0.002, 1000.0);
        for s in &out {
            let expect = (s.t_s * 10.0) as f32;
            assert!(
                (s.v_mv - expect).abs() < 0.011,
                "ramp sample at {} is {}, expected ~{}",
                s.t_s,
                s.v_mv,
                expect
            );
        }
    }

    #[test]
    fn envelope_is_inert_on_a_flat_segment() {
        // On the segments where ST is measured, lo == hi and the rule must not
        // move the signal at all.
        let v: Vec<Vertex> = (0..40)
            .map(|i| Vertex { t_s: i as f64 * 0.001, v_mv: 0.12 })
            .collect();
        let out = column_envelope(&v, 0.002, 1000.0);
        for s in &out {
            assert!((s.v_mv - 0.12).abs() < 1e-6, "flat segment moved to {}", s.v_mv);
        }
    }

    #[test]
    fn envelope_clamps_an_implausible_jump() {
        // Stands in for a merged neighbouring lead yanking the tracker.
        let v = vec![
            Vertex { t_s: 0.000, v_mv: 0.0 },
            Vertex { t_s: 0.002, v_mv: 0.0 },
            Vertex { t_s: 0.004, v_mv: 50.0 },
            Vertex { t_s: 0.006, v_mv: 0.0 },
        ];
        let out = column_envelope(&v, 0.002, 100.0); // 100 mV/s * 2 ms = 0.2 mV
        let peak = out.iter().map(|x| x.v_mv).fold(f32::MIN, f32::max);
        assert!(peak <= 0.45, "jump was not clamped: {peak} mV");
    }

    #[test]
    fn envelope_handles_a_single_vertex() {
        let out = column_envelope(&[Vertex { t_s: 0.0, v_mv: 0.5 }], 0.002, 1000.0);
        assert_eq!(out.len(), 1);
        assert!((out[0].v_mv - 0.5).abs() < 1e-6);
    }

    #[test]
    fn envelope_of_nothing_is_nothing() {
        assert!(column_envelope(&[], 0.002, 1000.0).is_empty());
    }

    // ---- Rate selection ----------------------------------------------------

    #[test]
    fn intermediate_rate_never_goes_below_source_or_canonical() {
        assert_eq!(intermediate_rate(200.0, FS), 500.0);
        assert_eq!(intermediate_rate(977.0, FS), 980.0);
        assert_eq!(intermediate_rate(1000.0, FS), 1000.0);
    }

    #[test]
    fn edge_samples_grow_as_the_cutoff_falls() {
        // A lower cutoff means a longer kernel, hence more contaminated samples.
        let wide = edge_samples(2000.0, FS);
        let narrow = edge_samples(295.0, FS);
        assert!(wide > 0 && narrow > 0);
        assert!(narrow > wide, "expected {narrow} > {wide}");
    }
}
