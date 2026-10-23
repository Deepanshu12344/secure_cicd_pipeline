"""
Calibrated Logistic Regression model for True-Positive vs False-Positive classification.
Features linear interpretability: exact w_i * x_i log-odds contribution.
Includes cross-validation evaluation with mean +/- std metrics and sample weighting.
"""
from typing import Dict, Any, Tuple, Optional, List
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, brier_score_loss
from sklearn.model_selection import StratifiedKFold, StratifiedGroupKFold
from features import FEATURE_NAMES

CRITICAL_PROBABILITY_FLOOR = 0.20

class RiskClassifier:
    """
    Interpretable linear classifier for vulnerability finding triage.
    Predicts P(True Positive | finding features).
    """
    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.scaler = StandardScaler()
        self.base_model = LogisticRegression(
            class_weight='balanced',
            C=1.0,
            solver='lbfgs',
            max_iter=1000,
            random_state=random_state
        )
        self.is_fitted = False
        self.feature_names = FEATURE_NAMES

    def fit(self, X: np.ndarray, y: np.ndarray, sample_weight: Optional[np.ndarray] = None) -> 'RiskClassifier':
        """
        Fit the model on feature matrix X and binary labels y with optional sample_weight.
        y = 1 for confirmed vulnerability (True Positive).
        y = 0 for false positive.
        """
        X = np.asarray(X, dtype=np.float64)
        y = np.asarray(y, dtype=np.int64)

        if len(np.unique(y)) < 2:
            raise ValueError("Training requires at least two classes (confirmed and false_positive).")

        X_scaled = self.scaler.fit_transform(X)
        self.base_model.fit(X_scaled, y, sample_weight=sample_weight)
        self.is_fitted = True
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Return calibrated probabilities of True Positive (class 1).
        Shape: (N,)
        """
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted yet.")
        X = np.asarray(X, dtype=np.float64)
        if X.ndim == 1:
            X = X.reshape(1, -1)
        X_scaled = self.scaler.transform(X)
        probas = self.base_model.predict_proba(X_scaled)[:, 1]
        return probas

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """Return binary prediction: 1 (confirmed) or 0 (false_positive)."""
        probas = self.predict_proba(X)
        return (probas >= threshold).astype(np.int64)

    def get_effective_weights(self) -> Dict[str, float]:
        """
        Return effective weights w_i and intercept for direct linear attribution:
        log_odds ≈ intercept + sum(w_i * x_i).
        """
        if not self.is_fitted:
            return {name: 0.0 for name in self.feature_names}

        coef = self.base_model.coef_[0]
        scale = np.where(self.scaler.scale_ == 0, 1.0, self.scaler.scale_)
        effective_w = coef / scale
        
        weights = {}
        for name, w in zip(self.feature_names, effective_w):
            weights[name] = round(float(w), 4)
        return weights

    def get_effective_intercept(self) -> float:
        """Return effective intercept accounting for feature centering."""
        if not self.is_fitted:
            return 0.0
        coef = self.base_model.coef_[0]
        scale = np.where(self.scaler.scale_ == 0, 1.0, self.scaler.scale_)
        mean = self.scaler.mean_
        raw_intercept = self.base_model.intercept_[0]
        eff_intercept = raw_intercept - np.sum((coef / scale) * mean)
        return round(float(eff_intercept), 4)

    def evaluate(self, X_val: np.ndarray, y_val: np.ndarray) -> Dict[str, Any]:
        """
        Compute standard evaluation metrics on a validation slice.
        FPR = FP / (FP + TN)
        """
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted yet.")

        X_val = np.asarray(X_val, dtype=np.float64)
        y_val = np.asarray(y_val, dtype=np.int64)

        if len(y_val) == 0:
            return {}

        probas = self.predict_proba(X_val)
        preds = (probas >= 0.5).astype(np.int64)

        acc = float(accuracy_score(y_val, preds))
        prec = float(precision_score(y_val, preds, zero_division=0))
        rec = float(recall_score(y_val, preds, zero_division=0))
        f1 = float(f1_score(y_val, preds, zero_division=0))
        brier = float(brier_score_loss(y_val, probas))

        cm = confusion_matrix(y_val, preds, labels=[0, 1])
        tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
        
        total_actual_negatives = fp + tn
        fpr = float(fp / total_actual_negatives) if total_actual_negatives > 0 else 0.0

        return {
            'accuracy': round(acc, 4),
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'f1': round(f1, 4),
            'fpr': round(fpr, 4),
            'brier_score': round(brier, 4),
            'confusion_matrix': {
                'tn': tn,
                'fp': fp,
                'fn': fn,
                'tp': tp
            },
            'sample_count': len(y_val)
        }

    @staticmethod
    def evaluate_cv(
        X: np.ndarray,
        y: np.ndarray,
        sample_weight: Optional[np.ndarray] = None,
        groups: Optional[np.ndarray] = None,
        n_splits: int = 5,
        random_state: int = 42
    ) -> Dict[str, Any]:
        """
        Stratified / Grouped K-Fold Cross Validation.
        Returns mean +/- std across folds to provide honest uncertainty bounds on small datasets.
        """
        X = np.asarray(X, dtype=np.float64)
        y = np.asarray(y, dtype=np.int64)
        n_samples = len(y)
        
        actual_splits = int(min(n_splits, int(np.bincount(y).min())))
        if actual_splits < 2:
            # Fallback if too few samples in minority class
            actual_splits = 2

        if groups is not None and len(np.unique(groups)) >= actual_splits:
            cv = StratifiedGroupKFold(n_splits=actual_splits, shuffle=True, random_state=random_state)
            splits = list(cv.split(X, y, groups))
        else:
            cv = StratifiedKFold(n_splits=actual_splits, shuffle=True, random_state=random_state)
            splits = list(cv.split(X, y))

        fold_metrics = []
        for train_idx, test_idx in splits:
            X_tr, y_tr = X[train_idx], y[train_idx]
            X_te, y_te = X[test_idx], y[test_idx]
            
            w_tr = sample_weight[train_idx] if sample_weight is not None else None
            
            fold_clf = RiskClassifier(random_state=random_state)
            fold_clf.fit(X_tr, y_tr, sample_weight=w_tr)
            m = fold_clf.evaluate(X_te, y_te)
            fold_metrics.append(m)

        def mean_std(key: str) -> Tuple[float, float]:
            vals = [m[key] for m in fold_metrics]
            return float(np.mean(vals)), float(np.std(vals))

        acc_mean, acc_std = mean_std('accuracy')
        prec_mean, prec_std = mean_std('precision')
        rec_mean, rec_std = mean_std('recall')
        f1_mean, f1_std = mean_std('f1')
        fpr_mean, fpr_std = mean_std('fpr')
        brier_mean, brier_std = mean_std('brier_score')

        return {
            'evaluation_method': f'{actual_splits}-fold-stratified-cv',
            'folds_count': actual_splits,
            'f1': round(f1_mean, 4),
            'f1_mean': round(f1_mean, 4),
            'f1_std': round(f1_std, 4),
            'fpr': round(fpr_mean, 4),
            'fpr_mean': round(fpr_mean, 4),
            'fpr_std': round(fpr_std, 4),
            'accuracy': round(acc_mean, 4),
            'accuracy_mean': round(acc_mean, 4),
            'accuracy_std': round(acc_std, 4),
            'precision': round(prec_mean, 4),
            'precision_mean': round(prec_mean, 4),
            'precision_std': round(prec_std, 4),
            'recall': round(rec_mean, 4),
            'recall_mean': round(rec_mean, 4),
            'recall_std': round(rec_std, 4),
            'brier_score': round(brier_mean, 4),
            'brier_score_std': round(brier_std, 4),
            'total_samples': int(n_samples)
        }
