"""Tests for canonical KS-test module."""
import sys
sys.path.insert(0, "backend-cv")

from agents.ks_test import kolmogorov_smirnov_test, evaluate_baseline_divergence


def test_ks_test_identical_distributions():
    sample = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    d_stat, p_value = kolmogorov_smirnov_test(sample, 0.5, 0.3)
    assert d_stat >= 0.0
    assert 0.0 <= p_value <= 1.0


def test_ks_test_empty_sample():
    d_stat, p_value = kolmogorov_smirnov_test([], 0.0, 1.0)
    assert d_stat == 0.0
    assert p_value == 1.0


def test_evaluate_baseline_divergence_no_divergence():
    baseline = [0.5] * 20
    current = [0.5, 0.51, 0.49]
    result = evaluate_baseline_divergence(current, baseline, threshold=0.5)
    assert "divergence_flagged" in result
    assert "ks_statistic" in result


def test_evaluate_baseline_divergence_empty():
    result = evaluate_baseline_divergence([], [])
    assert result["divergence_flagged"] is False
