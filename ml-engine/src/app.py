from flask import Flask, request, jsonify
from flask_cors import CORS
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ML Risk Scoring Models (placeholder)
class RiskScoringEngine:
    def __init__(self):
        self.vulnerability_weights = {
            'sql_injection': 10,
            'xss': 8,
            'authentication_bypass': 9,
            'data_exposure': 8,
            'weak_encryption': 7,
            'insecure_dependencies': 6,
            'missing_cors': 4,
            'misconfiguration': 5
        }
    
    def calculate_risk_score(self, findings):
        """Calculate overall risk score from findings"""
        if not findings:
            return 0
        
        total_score = 0
        for finding in findings:
            vuln_type = finding.get('type', '').lower()
            weight = self.vulnerability_weights.get(vuln_type, 5)
            count = finding.get('count', 1)
            total_score += weight * count
        
        # Normalize to 0-10 scale
        risk_score = min(10, total_score / 10)
        return round(risk_score, 1)
    
    def predict_risk_level(self, risk_score):
        """Predict risk level based on score"""
        if risk_score >= 8:
            return 'CRITICAL'
        elif risk_score >= 6:
            return 'HIGH'
        elif risk_score >= 4:
            return 'MEDIUM'
        else:
            return 'LOW'

engine = RiskScoringEngine()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ML Engine is running',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/score', methods=['POST'])
def calculate_score():
    """Calculate risk score for code analysis"""
    data = request.json
    
    code_analysis = data.get('analysis', {})
    dependencies = data.get('dependencies', [])
    configurations = data.get('configurations', [])
    
    findings = code_analysis.get('vulnerabilities', [])
    
    risk_score = engine.calculate_risk_score(findings)
    risk_level = engine.predict_risk_level(risk_score)
    
    return jsonify({
        'success': True,
        'data': {
            'risk_score': risk_score,
            'risk_level': risk_level,
            'findings_count': len(findings),
            'dependencies_checked': len(dependencies),
            'recommendations': generate_recommendations(risk_level, findings)
        }
    })

@app.route('/api/analyze', methods=['POST'])
def analyze_code():
    """Analyze code for vulnerabilities"""
    data = request.json
    
    code = data.get('code', '')
    language = data.get('language', 'javascript')
    
    vulnerabilities = scan_code(code, language)
    risk_score = engine.calculate_risk_score(vulnerabilities)
    
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
    """Check dependencies for vulnerabilities"""
    data = request.json
    
    dependencies = data.get('dependencies', [])
    
    vulnerable_deps = []
    for dep in dependencies:
        # Mock vulnerability check
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
    """Scan code for vulnerabilities"""
    vulnerabilities = []
    
    # Simple pattern matching for common vulnerabilities
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

def generate_recommendations(risk_level, findings):
    """Generate recommendations based on risk level"""
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

if __name__ == '__main__':
    app.run(debug=True, port=5001)
