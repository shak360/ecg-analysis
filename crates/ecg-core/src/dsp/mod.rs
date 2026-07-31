//! Signal conditioning: statistics, baseline removal, resampling, beat detection.

pub mod resample;

/// Root-mean-square of a slice. Returns 0.0 for an empty slice rather than NaN,
/// because callers treat this as an energy measure on possibly-absent leads.
pub fn rms(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    let sum_sq: f64 = x.iter().map(|&v| (v as f64) * (v as f64)).sum();
    ((sum_sq / x.len() as f64).sqrt()) as f32
}

/// Arithmetic mean, 0.0 for an empty slice.
pub fn mean(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    (x.iter().map(|&v| v as f64).sum::<f64>() / x.len() as f64) as f32
}

/// Median of a slice, computed on a scratch copy so the input is left intact.
///
/// Uses `select_nth_unstable_by` (quickselect, O(n) average) rather than a full
/// sort: the running-median baseline filter calls this on every sample of every
/// lead, so the constant factor is not academic.
///
/// NaNs sort to the end and are therefore excluded from the median unless the
/// whole slice is NaN, in which case the result is NaN.
pub fn median(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    let mut buf: Vec<f32> = x.to_vec();
    let n = buf.len();
    let mid = n / 2;
    buf.select_nth_unstable_by(mid, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Greater));
    if n % 2 == 1 {
        buf[mid]
    } else {
        // For an even count take the mean of the two central order statistics.
        // buf[..mid] is now everything <= buf[mid], so the lower central value is
        // its maximum.
        let lower = buf[..mid]
            .iter()
            .copied()
            .fold(f32::NEG_INFINITY, |a, b| if b > a { b } else { a });
        0.5 * (lower + buf[mid])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_of_empty_is_zero_not_nan() {
        assert_eq!(rms(&[]), 0.0);
    }

    #[test]
    fn rms_of_constant_is_the_magnitude() {
        assert!((rms(&[3.0, -3.0, 3.0, -3.0]) - 3.0).abs() < 1e-6);
    }

    #[test]
    fn rms_of_unit_sine_is_one_over_root_two() {
        // 512 whole cycles so the mean-square is exact to floating point.
        let n = 4096;
        let x: Vec<f32> = (0..n)
            .map(|i| (2.0 * std::f64::consts::PI * 512.0 * i as f64 / n as f64).sin() as f32)
            .collect();
        assert!((rms(&x) - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-4);
    }

    #[test]
    fn median_odd_and_even_lengths() {
        assert_eq!(median(&[5.0, 1.0, 3.0]), 3.0);
        assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), 2.5);
    }

    #[test]
    fn median_leaves_input_untouched() {
        let x = [9.0f32, 2.0, 7.0];
        let _ = median(&x);
        assert_eq!(x, [9.0, 2.0, 7.0]);
    }

    #[test]
    fn median_resists_outliers_that_would_drag_the_mean() {
        // The point of using median for baseline estimation: one 10 mV artifact
        // spike must not move the estimate.
        let x = [0.0, 0.0, 0.0, 0.0, 10.0];
        assert_eq!(median(&x), 0.0);
        assert!(mean(&x) > 1.0);
    }
}
