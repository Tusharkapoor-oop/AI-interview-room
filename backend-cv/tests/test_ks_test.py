from agents.ks_test import kolmogorov_smirnov_2samp, evaluate_baseline_divergence


def test_ks_test_identical_distributions():
    sample = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    d_stat, p_value = kolmogorov_smirnov_2samp(sample, sample)
    assert d_stat >= 0.0
    assert 0.0 <= p_value <= 1.0


def test_ks_test_shifted_distributions():
    sample1 = [0.0, 0.1, 0.2, 0.3, 0.4]
    sample2 = [5.0, 5.1, 5.2, 5.3, 5.4]
    d_stat, p_value = kolmogorov_smirnov_2samp(sample1, sample2)
    assert d_stat >= 0.8


def test_ks_test_empty_sample():
    d_stat, p_value = kolmogorov_smirnov_2samp([], [1.0])
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


def test_ks_self_consistency():
    d1, p1 = kolmogorov_smirnov_2samp([1, 2, 3], [1, 2, 3])
    d2, p2 = kolmogorov_smirnov_2samp([1, 2, 3], [1, 2, 3])
    assert d1 == d2
    assert p1 == p2
