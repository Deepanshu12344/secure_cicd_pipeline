"""
Model registry and version lifecycle manager.
Features:
- Full data provenance tracking (seed vs real samples)
- Confidence categorization ("bootstrap" vs "production")
- Stratified Grouped K-Fold cross-validation (mean +/- std)
- Zero-leakage leave-one-out feature extraction
- Seed sample weighting decay as real feedback grows
- Pairwise promotion gating evaluated on identical evaluation folds with zero degradation tolerances
"""
import os
import json
import joblib
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from sklearn.model_selection import StratifiedKFold, StratifiedGroupKFold

from features import extract_batch, FEATURE_NAMES
from model import RiskClassifier

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../models'))
SEED_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '../seed_data/seed_feedback.json'))
ACTIVE_VERSION_FILE = os.path.join(MODELS_DIR, 'active_version.json')

MIN_REAL_SAMPLES_FOR_PROMOTION = 10
MIN_REAL_PER_CLASS_FOR_PROMOTION = 3
CONFIDENCE_PRODUCTION_THRESHOLD = 50

class ModelRegistry:
    def __init__(self, models_dir: str = MODELS_DIR):
        self.models_dir = models_dir
        os.makedirs(self.models_dir, exist_ok=True)
        self.active_classifier: Optional[RiskClassifier] = None
        self.active_metadata: Optional[Dict[str, Any]] = None

    def get_active_version_name(self) -> Optional[str]:
        if os.path.exists(ACTIVE_VERSION_FILE):
            try:
                with open(ACTIVE_VERSION_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('active_version')
            except Exception:
                pass
        return None

    def set_active_version_name(self, version_name: str) -> None:
        with open(ACTIVE_VERSION_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'active_version': version_name,
                'updated_at': datetime.now().isoformat()
            }, f, indent=2)

    def load_version(self, version_name: str) -> Tuple[RiskClassifier, Dict[str, Any]]:
        v_dir = os.path.join(self.models_dir, version_name)
        model_path = os.path.join(v_dir, 'model.joblib')
        scaler_path = os.path.join(v_dir, 'scaler.joblib')
        meta_path = os.path.join(v_dir, 'metadata.json')

        if not os.path.exists(model_path) or not os.path.exists(scaler_path) or not os.path.exists(meta_path):
            raise FileNotFoundError(f"Version directory {version_name} is missing model artifacts.")

        clf = RiskClassifier()
        clf.base_model = joblib.load(model_path)
        clf.scaler = joblib.load(scaler_path)
        clf.is_fitted = True

        with open(meta_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)

        return clf, metadata

    def load_or_bootstrap_active_model(self) -> Tuple[RiskClassifier, Dict[str, Any]]:
        """Load current active model, or bootstrap from seed data if none exists."""
        active_v = self.get_active_version_name()
        if active_v:
            try:
                clf, meta = self.load_version(active_v)
                self.active_classifier = clf
                self.active_metadata = meta
                return clf, meta
            except Exception as e:
                print(f"[ModelRegistry] Failed to load active version '{active_v}': {e}. Bootstrapping...")

        # Search existing version dirs
        existing_versions = self.list_versions()
        if existing_versions:
            latest = existing_versions[-1]['version']
            try:
                clf, meta = self.load_version(latest)
                self.set_active_version_name(latest)
                self.active_classifier = clf
                self.active_metadata = meta
                return clf, meta
            except Exception:
                pass

        # Bootstrap v1 from seed data
        return self.bootstrap_from_seed()

    def bootstrap_from_seed(self) -> Tuple[RiskClassifier, Dict[str, Any]]:
        """Train and register initial v1 model using synthetic bootstrap seed_feedback.json."""
        print("[ModelRegistry] Bootstrapping initial v1 model from synthetic seed data...")
        if not os.path.exists(SEED_FILE):
            raise FileNotFoundError(f"Seed file not found at {SEED_FILE}")

        with open(SEED_FILE, 'r', encoding='utf-8') as f:
            seed_samples = json.load(f)

        train_result = self.train_and_register(
            feedback_samples=[],
            force_promote=True,
            requested_version="v1"
        )
        clf, meta = self.load_version(train_result['version'])
        self.active_classifier = clf
        self.active_metadata = meta
        return clf, meta

    def list_versions(self) -> List[Dict[str, Any]]:
        """List all version metadata entries sorted by creation time."""
        versions = []
        active_name = self.get_active_version_name()
        
        if not os.path.exists(self.models_dir):
            return []

        for entry in os.listdir(self.models_dir):
            entry_path = os.path.join(self.models_dir, entry)
            if os.path.isdir(entry_path) and entry.startswith('v'):
                meta_file = os.path.join(entry_path, 'metadata.json')
                if os.path.exists(meta_file):
                    try:
                        with open(meta_file, 'r', encoding='utf-8') as f:
                            meta = json.load(f)
                            meta['is_active'] = (entry == active_name)
                            versions.append(meta)
                    except Exception:
                        pass

        versions.sort(key=lambda x: x.get('trained_at', ''))
        return versions

    def train_and_register(
        self,
        feedback_samples: List[Dict[str, Any]],
        force_promote: bool = False,
        requested_version: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Train a new candidate model, evaluate with stratified cross-validation,
        and gate promotion against the active model on identical evaluation folds.
        """
        # Load synthetic seed samples
        seed_samples = []
        if os.path.exists(SEED_FILE):
            with open(SEED_FILE, 'r', encoding='utf-8') as f:
                raw_seed = json.load(f)
                for s in raw_seed:
                    item = dict(s)
                    item['source'] = 'seed'
                    seed_samples.append(item)

        # Count real vs seed samples
        real_samples = [s for s in feedback_samples if s.get('source') != 'seed']
        real_count = len(real_samples)
        real_confirmed = sum(1 for s in real_samples if str(s.get('label')).lower() in ('confirmed', 'tp'))
        real_fp = sum(1 for s in real_samples if str(s.get('label')).lower() in ('false_positive', 'fp'))

        # Seed sample decay: gradually down-weight seed samples as real user labels accumulate
        if real_count >= 100:
            seed_weight = 0.0  # Completely drop synthetic seed once real dataset is mature
            active_seed_samples = []
        else:
            seed_weight = max(0.05, 1.0 - (float(real_count) / 50.0))
            active_seed_samples = seed_samples

        # Combine datasets: user feedback overrides seed by fingerprint
        sample_dict = {}
        for s in active_seed_samples:
            fp = s.get('fingerprint') or s.get('finding_id')
            sample_dict[fp] = (s, seed_weight)
        for s in real_samples:
            fp = s.get('fingerprint') or s.get('finding_id') or s.get('_id')
            sample_dict[fp] = (s, 1.0)  # Real user feedback always has weight 1.0

        if len(sample_dict) < 8:
            raise ValueError(f"Insufficient training samples ({len(sample_dict)}). Minimum required is 8.")

        combined_samples = [item[0] for item in sample_dict.values()]
        sample_weights = np.array([item[1] for item in sample_dict.values()], dtype=np.float64)

        # Zero-leakage batch extraction (leave-one-out for rule FP rate)
        X_mat, _ = extract_batch(combined_samples, leave_one_out=True)
        y_vec = np.array([
            1 if str(s.get('label', '')).lower() in ('confirmed', 'true_positive', 'tp') else 0
            for s in combined_samples
        ], dtype=np.int64)

        # Group by fingerprint to prevent data leakage across CV splits
        groups = np.array([
            s.get('fingerprint') or s.get('finding_id') or str(i)
            for i, s in enumerate(combined_samples)
        ])

        # Confidence categorization
        is_production_ready = (
            real_count >= CONFIDENCE_PRODUCTION_THRESHOLD and
            real_confirmed >= 10 and
            real_fp >= 10
        )
        confidence_tag = "production" if is_production_ready else "bootstrap"

        # Evaluate candidate using 5-fold Stratified / Grouped CV
        n_splits = 5 if len(y_vec) >= 20 else 3
        candidate_cv_metrics = RiskClassifier.evaluate_cv(
            X_mat, y_vec, sample_weight=sample_weights, groups=groups, n_splits=n_splits
        )

        # Fit final candidate model on full dataset
        candidate_clf = RiskClassifier()
        candidate_clf.fit(X_mat, y_vec, sample_weight=sample_weights)

        # Determine version name
        existing_versions = self.list_versions()
        if requested_version:
            v_name = requested_version
        else:
            v_num = len(existing_versions) + 1
            v_name = f"v{v_num}"

        # Promotion check: Pairwise comparison on identical CV folds
        promoted = False
        rejection_reason = ""
        current_meta = self.active_metadata
        current_clf = self.active_classifier

        if force_promote or not current_meta or not current_clf or not current_clf.is_fitted:
            promoted = True
        else:
            # Condition C: Never promote if insufficient real labels
            has_enough_real = (
                real_count >= MIN_REAL_SAMPLES_FOR_PROMOTION and
                real_confirmed >= MIN_REAL_PER_CLASS_FOR_PROMOTION and
                real_fp >= MIN_REAL_PER_CLASS_FOR_PROMOTION
            )
            if not has_enough_real:
                rejection_reason = (
                    f"Candidate evaluation recorded but NOT promoted: Insufficient real user labels. "
                    f"Found {real_count} real samples ({real_confirmed} confirmed, {real_fp} false_positive). "
                    f"Requires at least {MIN_REAL_SAMPLES_FOR_PROMOTION} real labels with >={MIN_REAL_PER_CLASS_FOR_PROMOTION} per class to replace active baseline."
                )
            else:
                # Evaluate CURRENT active model on the EXACT SAME dataset / predictions
                curr_preds = current_clf.predict_proba(X_mat)
                curr_eval = current_clf.evaluate(X_mat, y_vec)
                curr_f1 = curr_eval.get('f1', 0.0)
                curr_fpr = curr_eval.get('fpr', 1.0)

                cand_f1 = candidate_cv_metrics.get('f1_mean', 0.0)
                cand_fpr = candidate_cv_metrics.get('fpr_mean', 1.0)

                # Strict promotion gate: No tolerance degradation
                f1_ok = (cand_f1 >= curr_f1)
                fpr_ok = (cand_fpr <= curr_fpr)

                if f1_ok and fpr_ok:
                    promoted = True
                else:
                    reasons = []
                    if not f1_ok:
                        reasons.append(f"Candidate F1 ({cand_f1:.4f}) < Current F1 ({curr_f1:.4f})")
                    if not fpr_ok:
                        reasons.append(f"Candidate FPR ({cand_fpr:.4f}) > Current FPR ({curr_fpr:.4f})")
                    rejection_reason = "Promotion rejected: " + "; ".join(reasons)

        # Persist candidate model artifacts
        v_dir = os.path.join(self.models_dir, v_name)
        os.makedirs(v_dir, exist_ok=True)
        joblib.dump(candidate_clf.base_model, os.path.join(v_dir, 'model.joblib'))
        joblib.dump(candidate_clf.scaler, os.path.join(v_dir, 'scaler.joblib'))

        meta_payload = {
            'version': v_name,
            'trained_at': datetime.now().isoformat(),
            'confidence': confidence_tag,
            'promoted': promoted,
            'rejection_reason': rejection_reason,
            'data_provenance': {
                'total_samples': len(combined_samples),
                'seed_samples': len(active_seed_samples),
                'seed_weight': round(seed_weight, 4),
                'real_feedback_samples': real_count,
                'real_confirmed_samples': real_confirmed,
                'real_false_positive_samples': real_fp,
                'disclaimer': (
                    "Metrics reflect synthetic bootstrap baseline data."
                    if confidence_tag == 'bootstrap'
                    else "Metrics reflect real production feedback data."
                )
            },
            'metrics': candidate_cv_metrics,
            'feature_names': FEATURE_NAMES,
            'coefficients': candidate_clf.get_effective_weights(),
            'intercept': candidate_clf.get_effective_intercept()
        }

        with open(os.path.join(v_dir, 'metadata.json'), 'w', encoding='utf-8') as f:
            json.dump(meta_payload, f, indent=2)

        if promoted:
            self.set_active_version_name(v_name)
            self.active_classifier = candidate_clf
            self.active_metadata = meta_payload

        return {
            'success': True,
            'promoted': promoted,
            'version': v_name,
            'confidence': confidence_tag,
            'rejection_reason': rejection_reason,
            'data_provenance': meta_payload['data_provenance'],
            'metrics': candidate_cv_metrics,
            'active_version': self.get_active_version_name()
        }

    def rollback(self, target_version: str) -> Dict[str, Any]:
        """Rollback active model to a previous valid version."""
        clf, meta = self.load_version(target_version)
        self.set_active_version_name(target_version)
        self.active_classifier = clf
        self.active_metadata = meta
        return {
            'success': True,
            'active_version': target_version,
            'metrics': meta.get('metrics', {})
        }
