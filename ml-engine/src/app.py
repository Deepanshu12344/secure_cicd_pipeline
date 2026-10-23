import os
import json
from datetime import datetime
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS

from features import extract_features, extract_batch, FEATURE_NAMES
from model import RiskClassifier, CRITICAL_PROBABILITY_FLOOR
from explain import generate_natural_explanation
from registry import ModelRegistry

app = Flask(__name__)
CORS(app)

# Initialize registry and bootstrap/load active model
registry = ModelRegistry()
try:
    active_clf, active_meta = registry.load_or_bootstrap_active_model()
    print(f"[ML Engine] Active model loaded: {active_meta.get('version')} (F1: {active_meta.get('metrics', {}).get('f1')})")
except Exception as e:
    print(f"[ML Engine] Warning: Failed to initialize model registry: {e}")
    active_clf = None
    active_meta = None

# Baseline vulnerability weights for rule-based heuristics
VULNERABILITY_WEIGHTS = {
    'sql_injection': 10,
    'command_injection': 10,
    'secret_exposure': 9,
    'xss': 8,
    'authentication_bypass': 9,
    'data_exposure': 8,
    'weak_encryption': 7,
    'weak_crypto': 7,
    'insecure_dependencies': 6,
    'missing_cors': 4,
    'misconfiguration': 5
}

def get_base_weight(finding: Dict[str, Any]) -> float:
    vuln_type = str(finding.get('threat_type') or finding.get('type') or finding.get('title') or '').lower()
    for k, w in VULNERABILITY_WEIGHTS.items():
        if k in vuln_type:
            return float(w)
    severity = str(finding.get('severity') or 'MEDIUM').upper()
    if severity == 'CRITICAL':
        return 9.5
    elif severity == 'HIGH':
        return 7.5
    elif severity == 'MEDIUM':
        return 5.0
    return 3.0

def predict_risk_level(score: float) -> str:
    if score >= 8.0:
        return 'CRITICAL'
    elif score >= 6.0:
        return 'HIGH'
    elif score >= 4.0:
        return 'MEDIUM'
    return 'LOW'

def generate_recommendations(risk_level: str, findings: List[Dict[str, Any]]) -> List[str]:
    recommendations = []
    if risk_level == 'CRITICAL':
        recommendations.append('Immediate remediation required - block deployment')
        recommendations.append('Conduct security review with team')
        recommendations.append('Perform manual penetration testing')
    elif risk_level == 'HIGH':
        recommendations.append('Fix identified vulnerabilities before deployment')
        recommendations.append('Review and update security measures')
    elif risk_level == 'MEDIUM':
        recommendations.append('Consider improvements in security practices')
        recommendations.append('Regular monitoring recommended')
    else:
        recommendations.append('Continue standard security practices')
    return recommendations


@app.route('/health', methods=['GET'])
def health():
    active_v = registry.get_active_version_name() or 'bootstrap'
    return jsonify({
        'status': 'ML Engine is running',
        'active_model': active_v,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/score', methods=['POST'])
def calculate_score():
    """
    Calculate raw and ML-adjusted risk scores.
    Enriches every finding with predicted TP probability, floor enforcement, and linear explanation.
    """
    data = request.json or {}
    
    code_analysis = data.get('analysis', {})
    dependencies = data.get('dependencies', [])
    configurations = data.get('configurations', [])
    
    raw_findings = data.get('findings') or code_analysis.get('vulnerabilities', [])
    rule_stats = data.get('rule_stats', {})

    active_classifier = registry.active_classifier
    active_version = registry.get_active_version_name() or 'v0-heuristic'

    total_raw_weight = 0.0
    total_adjusted_weight = 0.0
    enriched_findings = []

    for f in raw_findings:
        w = get_base_weight(f)
        count = float(f.get('count', 1))
        severity = str(f.get('severity', 'MEDIUM')).upper()

        vec, feat_dict = extract_features(f, rule_stats)

        if active_classifier and active_classifier.is_fitted:
            raw_prob = float(active_classifier.predict_proba(vec)[0])
        else:
            # Fallback heuristic: scale based on severity
            raw_prob = min(0.95, max(0.20, w / 10.0))

        # Enforce Safety Policy: Critical Findings Floor
        is_critical = (severity == 'CRITICAL')
        if is_critical and raw_prob < CRITICAL_PROBABILITY_FLOOR:
            adj_prob = CRITICAL_PROBABILITY_FLOOR
            clamped_by_floor = True
        else:
            adj_prob = raw_prob
            clamped_by_floor = False

        # Explainability
        if active_classifier and active_classifier.is_fitted:
            explanation = generate_natural_explanation(
                model=active_classifier,
                finding=f,
                feature_dict=feat_dict,
                raw_probability=raw_prob,
                adjusted_probability=adj_prob,
                clamped_by_floor=clamped_by_floor
            )
        else:
            explanation = {
                'probability': round(adj_prob, 4),
                'verdict': 'likely_real' if adj_prob >= 0.5 else 'needs_review',
                'summary': f"Heuristic probability estimate ({round(adj_prob * 100, 1)}%).",
                'top_positive_factors': [],
                'top_negative_factors': [],
                'clamped_by_floor': clamped_by_floor
            }

        # Auto-suppression threshold: non-critical findings with < 25% TP probability
        is_suppressed = bool(not is_critical and adj_prob < 0.25)
        suppression_reason = (
            f"Automated ML Suppression: Low True-Positive probability ({round(adj_prob * 100, 1)}% < 25%)"
            if is_suppressed else ""
        )

        item = dict(f)
        item['model_prediction'] = round(adj_prob, 4)
        item['raw_prediction'] = round(raw_prob, 4)
        item['model_version'] = active_version
        item['clamped_by_floor'] = clamped_by_floor
        item['is_suppressed'] = is_suppressed
        item['suppression_reason'] = suppression_reason
        item['explanation'] = explanation
        enriched_findings.append(item)

        total_raw_weight += (w * count)
        if not is_suppressed:
            total_adjusted_weight += (w * adj_prob * count)

    raw_score = round(min(10.0, total_raw_weight / 10.0), 1) if raw_findings else 0.0
    adjusted_score = round(min(10.0, total_adjusted_weight / 10.0), 1) if raw_findings else 0.0
    risk_level = predict_risk_level(adjusted_score)

    return jsonify({
        'success': True,
        'data': {
            'risk_score': adjusted_score,
            'raw_risk_score': raw_score,
            'adjusted_risk_score': adjusted_score,
            'risk_level': risk_level,
            'model_version': active_version,
            'findings_count': len(raw_findings),
            'suppressed_count': sum(1 for item in enriched_findings if item.get('is_suppressed')),
            'findings': enriched_findings,
            'dependencies_checked': len(dependencies),
            'recommendations': generate_recommendations(risk_level, raw_findings)
        }
    })


@app.route('/api/explain', methods=['POST'])
def explain_finding():
    """Generate detailed feature attribution and natural explanation for an individual finding."""
    data = request.json or {}
    finding = data.get('finding') or data
    rule_stats = data.get('rule_stats', {})

    active_classifier = registry.active_classifier
    active_version = registry.get_active_version_name() or 'v0-heuristic'

    vec, feat_dict = extract_features(finding, rule_stats)
    severity = str(finding.get('severity', 'MEDIUM')).upper()
    is_critical = (severity == 'CRITICAL')

    if active_classifier and active_classifier.is_fitted:
        raw_prob = float(active_classifier.predict_proba(vec)[0])
    else:
        w = get_base_weight(finding)
        raw_prob = min(0.95, max(0.20, w / 10.0))

    if is_critical and raw_prob < CRITICAL_PROBABILITY_FLOOR:
        adj_prob = CRITICAL_PROBABILITY_FLOOR
        clamped_by_floor = True
    else:
        adj_prob = raw_prob
        clamped_by_floor = False

    if active_classifier and active_classifier.is_fitted:
        explanation = generate_natural_explanation(
            model=active_classifier,
            finding=finding,
            feature_dict=feat_dict,
            raw_probability=raw_prob,
            adjusted_probability=adj_prob,
            clamped_by_floor=clamped_by_floor
        )
    else:
        explanation = {
            'probability': round(adj_prob, 4),
            'raw_probability': round(raw_prob, 4),
            'clamped_by_floor': clamped_by_floor,
            'verdict': 'likely_real' if adj_prob >= 0.5 else 'needs_review',
            'summary': f"Heuristic probability estimate ({round(adj_prob * 100, 1)}%).",
            'top_positive_factors': [],
            'top_negative_factors': [],
            'all_contributions': {}
        }

    return jsonify({
        'success': True,
        'data': {
            'model_version': active_version,
            'explanation': explanation,
            'features': feat_dict
        }
    })


@app.route('/api/train', methods=['POST'])
def train_model():
    """
    Train a new candidate model using user feedback + baseline seed data.
    Evaluates 20% holdout, enforces promotion gate, and records model version.
    """
    data = request.json or {}
    feedback_samples = data.get('feedback', [])
    force_promote = bool(data.get('force_promote', False))

    try:
        train_result = registry.train_and_register(
            feedback_samples=feedback_samples,
            force_promote=force_promote
        )
        return jsonify({
            'success': True,
            'data': train_result
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/model/info', methods=['GET'])
def get_model_info():
    """Return active model version, test metrics, and full version history."""
    active_v = registry.get_active_version_name()
    history = registry.list_versions()
    active_meta = registry.active_metadata

    # Calculate overall false-positive rate trend across versions
    history_trend = [
        {
            'version': v.get('version'),
            'trained_at': v.get('trained_at'),
            'samples_count': v.get('samples_count', 0),
            'confidence': v.get('confidence', 'bootstrap'),
            'data_provenance': v.get('data_provenance', {}),
            'promoted': v.get('promoted', False),
            'rejection_reason': v.get('rejection_reason', ''),
            'fpr': v.get('metrics', {}).get('fpr_mean', v.get('metrics', {}).get('fpr', 0.0)),
            'f1': v.get('metrics', {}).get('f1_mean', v.get('metrics', {}).get('f1', 0.0)),
            'accuracy': v.get('metrics', {}).get('accuracy_mean', v.get('metrics', {}).get('accuracy', 0.0)),
            'is_active': v.get('is_active', False)
        }
        for v in history
    ]

    provenance = active_meta.get('data_provenance', {}) if active_meta else {}
    confidence = active_meta.get('confidence', 'bootstrap') if active_meta else 'bootstrap'

    return jsonify({
        'success': True,
        'data': {
            'active_version': active_v,
            'confidence': confidence,
            'data_provenance': provenance,
            'seed_samples': provenance.get('seed_samples', 0),
            'real_feedback_samples': provenance.get('real_feedback_samples', 0),
            'current_metrics': active_meta.get('metrics', {}) if active_meta else {},
            'coefficients': active_meta.get('coefficients', {}) if active_meta else {},
            'trained_at': active_meta.get('trained_at') if active_meta else None,
            'samples_count': active_meta.get('samples_count', 0) if active_meta else 0,
            'version_history': history_trend
        }
    })


@app.route('/api/model/rollback', methods=['POST'])
def rollback_model():
    """Rollback active model to a previous valid version."""
    data = request.json or {}
    target_version = data.get('version')
    if not target_version:
        return jsonify({'success': False, 'error': 'target version is required'}), 400

    try:
        result = registry.rollback(target_version)
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


# Preserved legacy routes
@app.route('/api/analyze', methods=['POST'])
def analyze_code():
    data = request.json or {}
    code = data.get('code', '')
    language = data.get('language', 'javascript')
    
    vulnerabilities = scan_code(code, language)
    total_score = sum(get_base_weight(v) for v in vulnerabilities)
    risk_score = round(min(10.0, total_score / 10.0), 1)
    
    return jsonify({
        'success': True,
        'data': {
            'vulnerabilities': vulnerabilities,
            'risk_score': risk_score,
            'total_issues': len(vulnerabilities)
        }
    })


@app.route('/api/dependencies', methods=['POST'])
def check_dependencies():
    data = request.json or {}
    dependencies = data.get('dependencies', [])
    vulnerable_deps = []
    for dep in dependencies:
        if dep.get('version', '').startswith('1.'):
            vulnerable_deps.append({
                'name': dep.get('name'),
                'version': dep.get('version'),
                'severity': 'HIGH',
                'cve': 'CVE-2023-xxxx'
            })
    return jsonify({
        'success': True,
        'data': {
            'total_dependencies': len(dependencies),
            'vulnerable_count': len(vulnerable_deps),
            'vulnerabilities': vulnerable_deps
        }
    })


def scan_code(code, language):
    vulnerabilities = []
    if 'SELECT' in code.upper() and "'" in code:
        vulnerabilities.append({
            'type': 'SQL_INJECTION',
            'count': 1,
            'severity': 'CRITICAL'
        })
    if 'innerHTML' in code:
        vulnerabilities.append({
            'type': 'XSS',
            'count': 1,
            'severity': 'HIGH'
        })
    return vulnerabilities


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5001)
