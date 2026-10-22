"""
Feature extraction pipeline for vulnerability findings.
Produces deterministic, interpretable numerical feature vectors.
Includes leave-one-out historical statistics to prevent target label leakage during training.
"""
import math
import re
from collections import Counter, defaultdict
from typing import Dict, Any, List, Tuple, Optional
import numpy as np

FEATURE_NAMES = [
    'rule_weight',
    'is_sqli',
    'is_xss',
    'is_secret',
    'is_cmd_injection',
    'is_auth_bypass',
    'is_crypto_weakness',
    'is_cve_dep',
    'is_test_file',
    'is_doc_or_example',
    'is_vendor_or_build',
    'snippet_len_norm',
    'snippet_entropy',
    'has_sanitizer_nearby',
    'has_mock_comment',
    'historical_rule_fp_rate',
    'is_critical_severity'
]

SEVERITY_WEIGHT_MAP = {
    'CRITICAL': 9.5,
    'HIGH': 7.5,
    'MEDIUM': 5.0,
    'LOW': 2.5,
    'INFO': 1.0
}

DEFAULT_RULE_FP_RATES = {
    'SQL_INJECTION': 0.10,
    'SECRET_EXPOSURE': 0.35,
    'COMMAND_INJECTION': 0.12,
    'XSS': 0.25,
    'AUTHENTICATION_BYPASS': 0.15,
    'WEAK_CRYPTO': 0.20,
    'DEPENDENCY_VULNERABILITY': 0.18,
    'DEFAULT': 0.20
}

def calculate_shannon_entropy(text: str) -> float:
    """Compute Shannon entropy of a string (in bits per symbol)."""
    if not text:
        return 0.0
    counts = Counter(text)
    length = float(len(text))
    entropy = -sum((cnt / length) * math.log2(cnt / length) for cnt in counts.values())
    return round(float(entropy), 4)

def normalize_path(path: str) -> str:
    """Normalize file path for consistent matching across OSes."""
    if not path:
        return ''
    cleaned = str(path).replace('\\', '/').strip()
    cleaned = re.sub(r'^(\./|/)+', '', cleaned)
    cleaned = re.sub(r'^temp_repo/', '', cleaned)
    return cleaned.lower()

def extract_features(finding: Dict[str, Any], rule_stats: Optional[Dict[str, float]] = None) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    Extract a 17-dimensional numerical feature vector and a feature dictionary from a finding.
    Supports input keys from analyzer reports, backend models, and seed feedback.
    """
    rule_stats = rule_stats or {}

    file_path = normalize_path(
        finding.get('file') or
        finding.get('file_path') or
        finding.get('location', '').split(':')[0]
    )
    
    snippet = str(
        finding.get('snippet') or
        finding.get('code') or
        finding.get('match') or
        finding.get('description') or
        ''
    )
    
    rule_id = str(finding.get('rule_id') or finding.get('sourceIssueId') or finding.get('type') or '').upper()
    threat_type = str(finding.get('threat_type') or finding.get('type') or finding.get('title') or '').upper()
    severity = str(finding.get('severity') or 'MEDIUM').upper()
    
    combined_type_str = f"{rule_id} {threat_type}".lower()

    # 1. Rule weight
    base_weight = SEVERITY_WEIGHT_MAP.get(severity, 5.0)

    # 2-8. Vulnerability category indicators
    is_sqli = 1.0 if bool(re.search(r'\bsql\b|\bsqli\b|sql injection', combined_type_str)) else 0.0
    is_xss = 1.0 if bool(re.search(r'\bxss\b|cross[- ]?site', combined_type_str)) else 0.0
    is_secret = 1.0 if bool(re.search(r'secret|token|api_?key|password|credential|private_?key', combined_type_str)) else 0.0
    is_cmd_injection = 1.0 if bool(re.search(r'command|cmd|exec|eval|rce|system\(', combined_type_str)) else 0.0
    is_auth_bypass = 1.0 if bool(re.search(r'auth|jwt|session|permission|privilege|access[- ]?control', combined_type_str)) else 0.0
    is_crypto_weakness = 1.0 if bool(re.search(r'crypto|hash|md5|sha1|des|cipher|weak_encryption', combined_type_str)) else 0.0
    is_cve_dep = 1.0 if bool(re.search(r'cve|depend|package|outdated|audit', combined_type_str)) else 0.0

    # 9-11. File location context
    is_test_file = 1.0 if bool(re.search(
        r'(^|/)(tests?|specs?|__tests__|mocks?|fixtures?|test_helpers?|testing)(/|$)|\.(test|spec)\.[a-z0-9]+$',
        file_path
    )) else 0.0
    
    is_doc_or_example = 1.0 if bool(re.search(
        r'(^|/)(docs?|documentation|examples?|samples?|demos?|tutorials?)(/|$)',
        file_path
    )) else 0.0

    is_vendor_or_build = 1.0 if bool(re.search(
        r'(^|/)(vendor|node_modules|dist|build|out|\.next|\.nuxt)(/|$)|\.min\.[a-z0-9]+$',
        file_path
    )) else 0.0

    # 12-13. Snippet length & entropy
    snippet_len = len(snippet)
    snippet_len_norm = min(float(snippet_len) / 100.0, 3.0)
    snippet_entropy = calculate_shannon_entropy(snippet)

    # 14. Nearby sanitizer patterns (makes FP more likely for injection findings)
    has_sanitizer_nearby = 1.0 if bool(re.search(
        r'\b(escape|sanitize|sanitise|encode|prepare|parameter|preparedstatement|dompurify|validator|bcrypt|argon2|safe_load|query_param)\b',
        snippet,
        re.I
    )) else 0.0

    # 15. Mock/test marker comments or dummy values
    has_mock_comment = 1.0 if bool(re.search(
        r'\b(mock|fake|dummy|stub|placeholder|todo|sample|example|test_?\w*|fixture|example\.com|00000000|akiaiosfodnn7example)\b',
        snippet,
        re.I
    )) else 0.0

    # 16. Historical FP rate for this rule category
    rule_key = 'SQL_INJECTION' if is_sqli else (
        'SECRET_EXPOSURE' if is_secret else (
            'COMMAND_INJECTION' if is_cmd_injection else (
                'XSS' if is_xss else (
                    'AUTHENTICATION_BYPASS' if is_auth_bypass else (
                        'WEAK_CRYPTO' if is_crypto_weakness else (
                            'DEPENDENCY_VULNERABILITY' if is_cve_dep else 'DEFAULT'
                        )
                    )
                )
            )
        )
    )
    historical_fp_rate = float(rule_stats.get(rule_id, DEFAULT_RULE_FP_RATES.get(rule_key, 0.20)))

    # 17. Critical severity flag
    is_critical_severity = 1.0 if severity == 'CRITICAL' else 0.0

    feature_dict = {
        'rule_weight': round(base_weight, 2),
        'is_sqli': is_sqli,
        'is_xss': is_xss,
        'is_secret': is_secret,
        'is_cmd_injection': is_cmd_injection,
        'is_auth_bypass': is_auth_bypass,
        'is_crypto_weakness': is_crypto_weakness,
        'is_cve_dep': is_cve_dep,
        'is_test_file': is_test_file,
        'is_doc_or_example': is_doc_or_example,
        'is_vendor_or_build': is_vendor_or_build,
        'snippet_len_norm': round(snippet_len_norm, 4),
        'snippet_entropy': round(snippet_entropy, 4),
        'has_sanitizer_nearby': has_sanitizer_nearby,
        'has_mock_comment': has_mock_comment,
        'historical_rule_fp_rate': round(historical_fp_rate, 4),
        'is_critical_severity': is_critical_severity
    }

    feature_vec = np.array([feature_dict[name] for name in FEATURE_NAMES], dtype=np.float64)
    return feature_vec, feature_dict

def extract_batch(
    findings: List[Dict[str, Any]],
    rule_stats: Optional[Dict[str, float]] = None,
    leave_one_out: bool = False
) -> Tuple[np.ndarray, List[Dict[str, float]]]:
    """
    Extract features for a list of findings, returning matrix X and list of dicts.
    If leave_one_out is True and findings contain labels, computes historical_rule_fp_rate
    strictly excluding each sample's own label (zero target label leakage).
    """
    if not findings:
        return np.empty((0, len(FEATURE_NAMES))), []

    # If leave-one-out requested and samples have labels, compute per-sample stats
    per_sample_stats: Optional[List[Dict[str, float]]] = None
    if leave_one_out and any('label' in f for f in findings):
        rule_counts = defaultdict(int)
        rule_fp_counts = defaultdict(int)
        
        for f in findings:
            r_id = str(f.get('rule_id') or f.get('sourceIssueId') or f.get('type') or '').upper()
            lbl = str(f.get('label') or '').lower()
            if lbl:
                rule_counts[r_id] += 1
                if lbl in ('false_positive', 'fp', '0'):
                    rule_fp_counts[r_id] += 1

        per_sample_stats = []
        for f in findings:
            r_id = str(f.get('rule_id') or f.get('sourceIssueId') or f.get('type') or '').upper()
            lbl = str(f.get('label') or '').lower()
            is_fp = 1 if lbl in ('false_positive', 'fp', '0') else 0
            
            # Leave self out
            other_total = rule_counts[r_id] - (1 if lbl else 0)
            other_fp = rule_fp_counts[r_id] - is_fp
            if other_total > 0:
                per_sample_stats.append({r_id: float(other_fp) / float(other_total)})
            else:
                per_sample_stats.append({})

    vectors = []
    dicts = []
    for idx, f in enumerate(findings):
        sample_stat = per_sample_stats[idx] if per_sample_stats is not None else rule_stats
        vec, d = extract_features(f, sample_stat)
        vectors.append(vec)
        dicts.append(d)

    return np.vstack(vectors), dicts
