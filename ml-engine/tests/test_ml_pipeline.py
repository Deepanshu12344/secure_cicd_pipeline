"""
Comprehensive unit and integration tests for ML Engine:
- Feature extraction & entropy
- Zero target label leakage check (Condition D)
- Model fitting, calibration & stratified cross-validation (Condition B)
- Explainability & linear attributions
- Critical floor safety enforcement
- Model registry, promotion gating & rollback (Condition C)
- Data provenance and confidence tags (Condition A)
- Flask REST endpoints (/health, /api/score, /api/explain, /api/model/info, /api/train)
"""
import os
import sys
import json
import pytest
import numpy as np

SRC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../src'))
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from features import extract_features, extract_batch, calculate_shannon_entropy, FEATURE_NAMES
from model import RiskClassifier, CRITICAL_PROBABILITY_FLOOR
from explain import generate_natural_explanation
from registry import ModelRegistry, MIN_REAL_SAMPLES_FOR_PROMOTION
from app import app


def test_shannon_entropy():
    # Low entropy: repetitive characters
    low = calculate_shannon_entropy("aaaaaaaaaa")
    assert low == 0.0

    # High entropy: random-looking API key
    high = calculate_shannon_entropy("AKIA2J8F7K9L0M1N2P3Q")
    assert high > 3.0


def test_feature_extraction():
    test_finding = {
        'file': 'tests/unit/test_auth.py',
        'snippet': 'const mockKey = "AKIAIOSFODNN7EXAMPLE"; // mock dummy test',
        'severity': 'HIGH',
        'rule_id': 'SEC-002',
        'threat_type': 'Secret Exposure'
    }

    vec, feat_dict = extract_features(test_finding)

    assert len(vec) == len(FEATURE_NAMES)
    assert feat_dict['is_test_file'] == 1.0
    assert feat_dict['has_mock_comment'] == 1.0
    assert feat_dict['is_secret'] == 1.0
    assert feat_dict['is_critical_severity'] == 0.0

    # Production finding
    prod_finding = {
        'file': 'src/controllers/payment.js',
        'snippet': 'const query = "SELECT * FROM card WHERE id = " + input;',
        'severity': 'CRITICAL',
        'rule_id': 'SQL-001',
        'threat_type': 'SQL Injection'
    }
    vec2, feat_dict2 = extract_features(prod_finding)
    assert feat_dict2['is_test_file'] == 0.0
    assert feat_dict2['is_sqli'] == 1.0
    assert feat_dict2['is_critical_severity'] == 1.0
    assert feat_dict2['rule_weight'] >= 9.0


def test_leave_one_out_zero_target_leakage():
    """
    Condition D Verification:
    Sample i's extracted historical_rule_fp_rate must be calculated ONLY
    from samples j != i. Changing sample i's label must have ZERO effect on sample i's features.
    """
    sample_a = {
        'file': 'src/a.js',
        'snippet': 'SELECT * FROM users',
        'rule_id': 'SQL-CUSTOM-1',
        'label': 'confirmed'
    }
    sample_b = {
        'file': 'src/b.js',
        'snippet': 'SELECT * FROM accounts',
        'rule_id': 'SQL-CUSTOM-1',
        'label': 'false_positive'
    }

    # Extract with sample_a as 'confirmed'
    _, dicts_1 = extract_batch([sample_a, sample_b], leave_one_out=True)
    rate_a_1 = dicts_1[0]['historical_rule_fp_rate']
    rate_b_1 = dicts_1[1]['historical_rule_fp_rate']

    # Now change sample_a's label to 'false_positive'
    sample_a_modified = dict(sample_a, label='false_positive')
    _, dicts_2 = extract_batch([sample_a_modified, sample_b], leave_one_out=True)
    rate_a_2 = dicts_2[0]['historical_rule_fp_rate']
    rate_b_2 = dicts_2[1]['historical_rule_fp_rate']

    # Sample A's own rate MUST NOT CHANGE because its own label is left out!
    assert rate_a_1 == rate_a_2, "Leakage detected: Sample A's own label influenced its feature!"
    
    # Sample B's rate MUST CHANGE because Sample A's label changed from confirmed to false_positive!
    assert rate_b_1 != rate_b_2, "Sample B did not properly reflect the other sample's label change!"


def test_stratified_cv_metrics():
    """
    Condition B Verification:
    Verify cross-validation reports mean +/- std across folds.
    """
    X = np.array([
        [9.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2, 4.5, 0, 0, 0.1, 1],
        [9.5, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1.0, 4.8, 0, 0, 0.3, 1],
        [9.5, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.8, 2.5, 1, 1, 0.1, 1],
        [7.5, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 2.2, 0, 1, 0.3, 0],
        [8.0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1.5, 3.8, 0, 0, 0.2, 0],
        [5.0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0.4, 2.0, 1, 1, 0.2, 0],
    ] * 5)
    y = np.array([1, 1, 0, 0, 1, 0] * 5)

    cv_metrics = RiskClassifier.evaluate_cv(X, y, n_splits=3)
    assert 'f1_mean' in cv_metrics
    assert 'f1_std' in cv_metrics
    assert 'fpr_mean' in cv_metrics
    assert 'fpr_std' in cv_metrics
    assert cv_metrics['f1_mean'] > 0.70


def test_critical_floor_and_explanation():
    mock_clf = RiskClassifier()
    mock_clf.is_fitted = True
    mock_clf.base_model.coef_ = np.array([[1.0, 0.5, 0, 0, 0, 0, 0, 0, -2.5, 0, 0, 0, 0.5, -2.0, -2.0, 0, 1.0]])
    mock_clf.base_model.intercept_ = np.array([0.0])
    mock_clf.scaler.scale_ = np.ones(17)
    mock_clf.scaler.mean_ = np.zeros(17)

    finding = {
        'file': 'tests/test_bypass.py',
        'severity': 'CRITICAL',
        'rule_id': 'AUTH-001',
        'snippet': 'mock_bypass = True'
    }
    vec, feat_dict = extract_features(finding)
    raw_p = 0.08
    adj_p = max(CRITICAL_PROBABILITY_FLOOR, raw_p)
    clamped = (adj_p > raw_p)

    assert clamped is True
    assert adj_p == 0.20

    exp = generate_natural_explanation(
        model=mock_clf,
        finding=finding,
        feature_dict=feat_dict,
        raw_probability=raw_p,
        adjusted_probability=adj_p,
        clamped_by_floor=clamped
    )

    assert exp['clamped_by_floor'] is True
    assert 'Critical severity floor applied' in exp['summary']
    assert len(exp['top_negative_factors']) > 0


def test_registry_bootstrap_provenance_and_promotion_gate(tmp_path):
    """
    Conditions A, B, C Verification:
    1. Bootstrap v1 has confidence: 'bootstrap' and data_provenance clearly exposed.
    2. Candidate with insufficient real samples is NOT promoted to active, returning clear reason.
    """
    registry = ModelRegistry(models_dir=str(tmp_path / 'models'))
    clf, meta = registry.bootstrap_from_seed()

    assert meta['version'] == 'v1'
    assert meta['promoted'] is True
    assert meta['confidence'] == 'bootstrap'
    assert meta['data_provenance']['seed_samples'] == 60
    assert meta['data_provenance']['real_feedback_samples'] == 0
    assert 'f1_mean' in meta['metrics']
    assert 'fpr_mean' in meta['metrics']

    # Try to train candidate with only 2 real samples (below MIN_REAL_SAMPLES_FOR_PROMOTION = 10)
    few_real_samples = [
        {'fingerprint': 'fp_real_1', 'label': 'confirmed', 'file': 'src/app.js', 'snippet': 'eval(x)', 'source': 'user'},
        {'fingerprint': 'fp_real_2', 'label': 'false_positive', 'file': 'tests/app.js', 'snippet': 'test', 'source': 'user'}
    ]

    res = registry.train_and_register(few_real_samples)
    assert res['promoted'] is False
    assert "Insufficient real user labels" in res['rejection_reason']
    # Active version should remain v1
    assert registry.get_active_version_name() == 'v1'


def test_flask_api_endpoints():
    client = app.test_client()

    # 1. Health
    res = client.get('/health')
    assert res.status_code == 200
    assert res.get_json()['status'] == 'ML Engine is running'

    # 2. Score with multiple findings
    score_payload = {
        'findings': [
            {
                'file': 'src/api/auth.js',
                'snippet': 'const token = "AKIA1234567890EXAMPLE";',
                'severity': 'CRITICAL',
                'rule_id': 'SEC-001',
                'threat_type': 'Secret Exposure'
            },
            {
                'file': 'tests/mocks/auth.mock.js',
                'snippet': 'const dummyToken = "AKIAIOSFODNN7EXAMPLE"; // mock dummy',
                'severity': 'MEDIUM',
                'rule_id': 'SEC-001',
                'threat_type': 'Secret Exposure'
            }
        ]
    }
    res = client.post('/api/score', json=score_payload)
    assert res.status_code == 200
    data = res.get_json()['data']
    assert 'raw_risk_score' in data
    assert 'adjusted_risk_score' in data
    assert data['raw_risk_score'] > 0
    assert len(data['findings']) == 2

    # 3. Model info exposes provenance and confidence tag
    res = client.get('/api/model/info')
    assert res.status_code == 200
    info_data = res.get_json()['data']
    assert 'active_version' in info_data
    assert 'confidence' in info_data
    assert 'data_provenance' in info_data
    assert 'seed_samples' in info_data
    assert 'real_feedback_samples' in info_data
    assert info_data['confidence'] in ['bootstrap', 'production']

    # 4. Explain endpoint
    res = client.post('/api/explain', json={'finding': data['findings'][0]})
    assert res.status_code == 200
    exp_data = res.get_json()['data']
    assert 'explanation' in exp_data
    assert 'top_positive_factors' in exp_data['explanation']
