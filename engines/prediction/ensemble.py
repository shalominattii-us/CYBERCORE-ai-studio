"""Stacked Ensemble Prediction Engine with Walk-Forward Validation."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import RobustScaler

from .data_loader import fetch_market_data
from .features import engineer_features, engineer_latest_features


@dataclass
class PredictionResult:
    symbol: str
    data_source: str
    horizon_steps: int
    current_price: float
    predicted_return_pct: float
    predicted_price: float
    direction: str
    confidence_score: float
    interval_80_low: float
    interval_80_high: float
    interval_95_low: float
    interval_95_high: float
    base_model_predictions_pct: Dict[str, float]
    metrics: Dict[str, float]
    top_features: List[Dict[str, float]]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PredictionEngine:
    """Multi-model stacked ensemble for financial & time-series forecasting."""

    def __init__(self, n_splits: int = 5, random_state: int = 42) -> None:
        self.n_splits = n_splits
        self.random_state = random_state

    def _build_base_models(self) -> Dict[str, Any]:
        return {
            "lightgbm": LGBMRegressor(
                n_estimators=200,
                learning_rate=0.04,
                num_leaves=31,
                subsample_for_bin=500,
                colsample_bytree=0.8,
                subsample=0.8,
                random_state=self.random_state,
                verbose=-1,
            ),
            "hist_gbm": HistGradientBoostingRegressor(
                max_iter=200,
                learning_rate=0.04,
                max_depth=5,
                l2_regularization=1.0,
                random_state=self.random_state,
            ),
            "random_forest": RandomForestRegressor(
                n_estimators=150,
                max_depth=8,
                min_samples_leaf=5,
                n_jobs=-1,
                random_state=self.random_state,
            ),
            "ridge": make_pipeline(
                RobustScaler(),
                Ridge(alpha=10.0),
            ),
        }

    def predict(
        self,
        symbol: str = "BTC",
        days: int = 90,
        horizon: int = 1,
    ) -> PredictionResult:
        df, source = fetch_market_data(symbol=symbol, days=days)
        current_price = float(df["close"].iloc[-1])

        X, y, feature_names = engineer_features(df, horizon=horizon)
        if len(X) < 80:
            raise ValueError(f"Insufficient samples ({len(X)}) for walk-forward training.")

        tscv = TimeSeriesSplit(n_splits=self.n_splits)
        base_names = list(self._build_base_models().keys())
        oof_preds = np.full((len(X), len(base_names)), np.nan)

        for train_idx, val_idx in tscv.split(X):
            X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
            X_val = X.iloc[val_idx]
            models = self._build_base_models()
            for m_idx, name in enumerate(base_names):
                models[name].fit(X_train, y_train)
                oof_preds[val_idx, m_idx] = models[name].predict(X_val)

        valid_mask = ~np.isnan(oof_preds).any(axis=1)
        oof_X = oof_preds[valid_mask]
        oof_y = y.iloc[valid_mask].values

        # Train meta-learner on out-of-fold predictions
        meta_model = RidgeCV(alphas=np.logspace(-2, 3, 20))
        meta_model.fit(oof_X, oof_y)
        meta_oof_pred = meta_model.predict(oof_X)

        # Compute walk-forward metrics
        rmse = float(root_mean_squared_error(oof_y, meta_oof_pred))
        mae = float(mean_absolute_error(oof_y, meta_oof_pred))
        dir_acc = float(np.mean(np.sign(meta_oof_pred) == np.sign(oof_y)))
        strategy_rets = np.sign(meta_oof_pred) * oof_y
        sharpe_proxy = float(
            (np.mean(strategy_rets) / (np.std(strategy_rets) + 1e-9)) * np.sqrt(252 * 24)
        )

        # Conformal residual quantiles for uncertainty intervals
        residuals = np.abs(oof_y - meta_oof_pred)
        q80 = float(np.quantile(residuals, 0.80))
        q95 = float(np.quantile(residuals, 0.95))

        # Fit final base models on full dataset for live inference
        final_models = self._build_base_models()
        latest_X, _ = engineer_latest_features(df)
        latest_base_preds = {}
        latest_meta_input = []

        for name in base_names:
            final_models[name].fit(X, y)
            pred_val = float(final_models[name].predict(latest_X)[0])
            latest_base_preds[name] = round(pred_val * 100.0, 4)
            latest_meta_input.append(pred_val)

        pred_log_ret = float(meta_model.predict(np.array([latest_meta_input]))[0])
        predicted_price = float(current_price * np.exp(pred_log_ret))
        pred_pct = float((np.exp(pred_log_ret) - 1.0) * 100.0)

        # Confidence score combines directional accuracy & model agreement
        model_std = float(np.std(latest_meta_input))
        agreement = float(np.exp(-model_std * 100.0))
        confidence = float(np.clip(0.5 * dir_acc + 0.5 * agreement, 0.0, 0.99))

        # Feature importances from LightGBM
        lgb_model = final_models["lightgbm"]
        importances = lgb_model.feature_importances_
        total_imp = float(np.sum(importances)) or 1.0
        top_features = sorted(
            [
                {"feature": feat, "importance": round(float(imp / total_imp), 4)}
                for feat, imp in zip(feature_names, importances)
            ],
            key=lambda x: x["importance"],
            reverse=True,
        )[:8]

        return PredictionResult(
            symbol=symbol.upper(),
            data_source=source,
            horizon_steps=horizon,
            current_price=round(current_price, 4),
            predicted_return_pct=round(pred_pct, 4),
            predicted_price=round(predicted_price, 4),
            direction="BULLISH" if pred_log_ret >= 0 else "BEARISH",
            confidence_score=round(confidence, 4),
            interval_80_low=round(float(current_price * np.exp(pred_log_ret - q80)), 4),
            interval_80_high=round(float(current_price * np.exp(pred_log_ret + q80)), 4),
            interval_95_low=round(float(current_price * np.exp(pred_log_ret - q95)), 4),
            interval_95_high=round(float(current_price * np.exp(pred_log_ret + q95)), 4),
            base_model_predictions_pct=latest_base_preds,
            metrics={
                "walk_forward_rmse": round(rmse, 6),
                "walk_forward_mae": round(mae, 6),
                "directional_accuracy": round(dir_acc, 4),
                "annualized_sharpe_proxy": round(sharpe_proxy, 3),
                "training_samples": int(len(X)),
            },
            top_features=top_features,
        )
