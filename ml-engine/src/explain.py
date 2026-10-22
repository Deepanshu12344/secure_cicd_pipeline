"""
Explainability engine for vulnerability predictions.
Transforms exact linear feature attributions (w_i * x_i) into human-readable explanations.
"""
from typing import Dict, Any, List, Optional
import numpy as np
from model import RiskClassifier, CRITICAL_PROBABILITY_FLOOR

FEATURE_DESCRIPTIONS = {
    'rule_weight': "Base vulnerability severity weight ({val:.1f}/10)",
    'is_sqli': "Category is SQL Injection",
    'is_xss': "Category is Cross-Site Scripting (XSS)",
    'is_secret': "Category is Hardcoded Secret / Credential",
    'is_cmd_injection': "Category is Command Injection / RCE",
    'is_auth_bypass': "Category is Authentication or Access Control Bypass",
    'is_crypto_weakness': "Category is Insecure Cryptography or Weak Hash",
    'is_cve_dep': "Category is Known Vulnerable Dependency (CVE)",
    'is_test_file': "File is located in a test, mock, or spec directory",
    'is_doc_or_example': "File is located in a documentation, sample, or example path",
    'is_vendor_or_build': "File is a vendor library or compiled build artifact",
    'snippet_len_norm': "Code snippet length context",
    'snippet_entropy': "Snippet Shannon entropy ({val:.2f} bits/sym) indicates randomness",
    'has_sanitizer_nearby': "Nearby input sanitization or parameterization detected",
    'has_mock_comment': "Mock, dummy, fake, or placeholder indicators found in snippet",
    'historical_rule_fp_rate': "Rule baseline false-positive rate ({val:.1%})",
    'is_critical_severity': "Marked as CRITICAL severity"
}

def generate_natural_explanation(
    model: RiskClassifier,
    finding: Dict[str, Any],
    feature_dict: Dict[str, float],
    raw_probability: float,
    adjusted_probability: float,
    clamped_by_floor: bool
) -> Dict[str, Any]:
    """
    Generate an explainable attribution report for a given finding.
    """
    weights = model.get_effective_weights()
    contributions = {}
    
    for feat_name, val in feature_dict.items():
        w = weights.get(feat_name, 0.0)
        # linear contribution to log-odds: impact = w_i * x_i
        impact = round(w * float(val), 4)
        contributions[feat_name] = impact

    # Separate positive contributors (making it MORE likely true positive)
    # and negative contributors (making it MORE likely false positive)
    positive_factors = []
    negative_factors = []

    for feat_name, impact in contributions.items():
        val = feature_dict.get(feat_name, 0.0)
        if abs(impact) < 0.001 and val == 0:
            continue

        desc_template = FEATURE_DESCRIPTIONS.get(feat_name, feat_name)
        try:
            formatted_desc = desc_template.format(val=val)
        except Exception:
            formatted_desc = desc_template

        factor_obj = {
            'feature': feat_name,
            'value': round(val, 2),
            'impact': impact,
            'description': formatted_desc
        }

        if impact > 0:
            positive_factors.append(factor_obj)
        elif impact < 0:
            negative_factors.append(factor_obj)

    # Sort factors by magnitude
    positive_factors.sort(key=lambda x: x['impact'], reverse=True)
    negative_factors.sort(key=lambda x: x['impact'])  # most negative first

    # Determine verdict
    if adjusted_probability >= 0.70:
        verdict = 'likely_real'
    elif adjusted_probability <= 0.30:
        verdict = 'likely_false_positive'
    else:
        verdict = 'needs_review'

    # Build human readable summary
    summary_parts = []
    pct = round(adjusted_probability * 100, 1)
    summary_parts.append(f"Predicted {pct}% probability of being a True Positive ({verdict.replace('_', ' ')}).")

    if positive_factors:
        top_pos = positive_factors[0]
        summary_parts.append(f"Primary risk driver: {top_pos['description']} (+{top_pos['impact']:.2f}).")

    if negative_factors:
        top_neg = negative_factors[0]
        summary_parts.append(f"Primary mitigator: {top_neg['description']} ({top_neg['impact']:.2f}).")

    if clamped_by_floor:
        summary_parts.append(
            f"Safety Policy: Critical severity floor applied (probability clamped from {round(raw_probability*100,1)}% up to {round(CRITICAL_PROBABILITY_FLOOR*100,1)}%)."
        )

    return {
        'probability': round(adjusted_probability, 4),
        'raw_probability': round(raw_probability, 4),
        'clamped_by_floor': clamped_by_floor,
        'verdict': verdict,
        'summary': " ".join(summary_parts),
        'top_positive_factors': positive_factors[:4],
        'top_negative_factors': negative_factors[:4],
        'all_contributions': contributions
    }
