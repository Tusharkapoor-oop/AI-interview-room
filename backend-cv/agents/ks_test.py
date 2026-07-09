"""
ks_test.py — Canonical Two-Sample Kolmogorov-Smirnov Test Implementation.
Consolidated from 4 duplicate implementations:
  - ks_test.py (original)
  - baseline_agent.py :: compute_ks_2samp
  - gaze_agent.py :: _compute_ks_2samp
  - forensic_engine.py :: _compute_ks_2samp

Uses numpy for performance — this is the authoritative source.
"""

import math
from typing import List, Tuple

import numpy as np


def kolmogorov_smirnov_2samp(
    sample1: List[float],
    sample2: List[float],
) -> Tuple[float, float]:
    """
    Two-sample Kolmogorov-Smirnov test.
    Returns (ks_statistic, p_value).
    
    H0: both samples come from the same continuous distribution.
    Reject H0 when p < 0.05 (conventional) or p < 0.01 (strict).
    """
    n1 = len(sample1)
    n2 = len(sample2)
    if n1 == 0 or n2 == 0:
        return 0.0, 1.0

    d1_sorted = np.sort(sample1)
    d2_sorted = np.sort(sample2)
    all_vals = np.concatenate([d1_sorted, d2_sorted])

    cdf1 = np.searchsorted(d1_sorted, all_vals, side='right') / n1
    cdf2 = np.searchsorted(d2_sorted, all_vals, side='right') / n2

    ks_stat = float(np.max(np.abs(cdf1 - cdf2)))

    # Asymptotic p-value
    ne = (n1 * n2) / (n1 + n2)
    lam = (math.sqrt(ne) + 0.12 + 0.11 / math.sqrt(ne)) * ks_stat

    if lam < 0.2:
        p_val = 1.0
    else:
        p_val = 0.0
        for j in range(1, 15):
            term = 2.0 * ((-1.0) ** (j - 1)) * math.exp(-2.0 * (j**2) * (lam**2))
            p_val += term
            if abs(term) < 1e-8:
                break
        p_val = max(0.0, min(1.0, p_val))

    return round(ks_stat, 6), round(p_val, 6)


def evaluate_baseline_divergence(
    current_features: List[float],
    baseline: List[float],
    threshold: float = 0.3,
    alpha: float = 0.05,
) -> dict:
    """
    Evaluate whether current_features diverge from baseline using KS test.
    
    Returns dict with:
      - ks_statistic: D value
      - p_value: statistical significance
      - divergence_flagged: True if D > threshold AND p < alpha
    """
    if not baseline or not current_features:
        return {
            "ks_statistic": 0.0,
            "p_value": 1.0,
            "divergence_flagged": False,
        }
    d_stat, p_value = kolmogorov_smirnov_2samp(current_features, baseline)
    return {
        "ks_statistic": round(d_stat, 4),
        "p_value": round(p_value, 4),
        "divergence_flagged": d_stat > threshold and p_value < alpha,
    }
