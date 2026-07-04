"""
ks_test.py — Single canonical KS-test implementation.
Consolidates 4 duplicate implementations from:
  - security_engine.py
  - forensic_engine.py
  - baseline_agent.py
  - hub.py
"""
import math
from typing import List, Tuple


def kolmogorov_smirnov_test(
    sample: List[float],
    baseline_mu: float = 0.0,
    baseline_sigma: float = 1.0,
) -> Tuple[float, float]:
    if not sample:
        return 0.0, 1.0
    n = len(sample)
    sample_sorted = sorted(sample)
    d_stat = 0.0
    for i, x in enumerate(sample_sorted):
        empirical_cdf = (i + 1) / n
        theoretical_cdf = 0.5 * (1 + math.erf((x - baseline_mu) / (baseline_sigma * math.sqrt(2))))
        d_stat = max(d_stat, abs(empirical_cdf - theoretical_cdf))
    p_value = math.exp(-2 * d_stat * d_stat * n)
    return d_stat, p_value


def evaluate_baseline_divergence(
    current_features: List[float],
    baseline: List[float],
    threshold: float = 0.3,
) -> dict:
    if not baseline or not current_features:
        return {"ks_statistic": 0.0, "p_value": 1.0, "divergence_flagged": False}
    mu = sum(baseline) / len(baseline)
    sigma = math.sqrt(sum((x - mu)**2 for x in baseline) / len(baseline)) or 1.0
    d_stat, p_value = kolmogorov_smirnov_test(current_features, mu, sigma)
    return {
        "ks_statistic": round(d_stat, 4),
        "p_value": round(p_value, 4),
        "divergence_flagged": d_stat > threshold,
    }
