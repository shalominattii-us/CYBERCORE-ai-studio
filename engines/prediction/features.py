"""Quantitative feature engineering for time-series prediction."""

from __future__ import annotations

from typing import List, Tuple
import numpy as np
import pandas as pd


def engineer_features(
    df: pd.DataFrame,
    horizon: int = 1,
) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    """Build stationary, leak-free features and forward log-return target.

    Returns:
        X: Feature DataFrame
        y: Target Series (forward `horizon`-step log return)
        feature_names: List of feature column names
    """
    data = df.copy()
    close = data["close"].astype(float)
    high = data["high"].astype(float)
    low = data["low"].astype(float)
    volume = data["volume"].astype(float).replace(0, np.nan).ffill().fillna(1.0)

    log_ret = np.log(close / close.shift(1))

    # Multi-horizon lag returns
    for lag in (1, 2, 3, 6, 12, 24):
        data[f"ret_lag_{lag}"] = np.log(close / close.shift(lag))

    # Rolling volatility & realized vol ratio
    for win in (6, 12, 24, 48):
        data[f"vol_{win}"] = log_ret.rolling(win).std()
    data["vol_ratio_6_24"] = data["vol_6"] / (data["vol_24"] + 1e-9)

    # Exponential moving average ratios
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    ema_50 = close.ewm(span=50, adjust=False).mean()
    data["ema_12_26_diff"] = (ema_12 - ema_26) / (close + 1e-9)
    data["ema_close_50_ratio"] = (close - ema_50) / (ema_50 + 1e-9)

    # MACD
    macd = ema_12 - ema_26
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    data["macd_hist"] = (macd - macd_signal) / (close + 1e-9)

    # RSI (14)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / (loss + 1e-9)
    data["rsi_14"] = 100.0 - (100.0 / (1.0 + rs))

    # Bollinger Bands (20, 2)
    sma_20 = close.rolling(20).mean()
    std_20 = close.rolling(20).std()
    upper_bb = sma_20 + 2.0 * std_20
    lower_bb = sma_20 - 2.0 * std_20
    data["bb_pct_b"] = (close - lower_bb) / (upper_bb - lower_bb + 1e-9)
    data["bb_width"] = (upper_bb - lower_bb) / (sma_20 + 1e-9)

    # High-low range & volume z-score
    data["hl_range"] = (high - low) / (close + 1e-9)
    vol_mean = volume.rolling(24).mean()
    vol_std = volume.rolling(24).std()
    data["volume_z_24"] = (volume - vol_mean) / (vol_std + 1e-9)

    # Cyclical time features
    if "timestamp" in data.columns:
        ts = pd.to_datetime(data["timestamp"], utc=True)
        hour = ts.dt.hour
        dow = ts.dt.dayofweek
        data["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
        data["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)
        data["dow_sin"] = np.sin(2 * np.pi * dow / 7.0)
        data["dow_cos"] = np.cos(2 * np.pi * dow / 7.0)

    # Forward target: log return over `horizon` steps
    data["target"] = np.log(close.shift(-horizon) / close)

    feature_names = [
        c
        for c in data.columns
        if c not in {"timestamp", "open", "high", "low", "close", "volume", "target"}
    ]

    valid = data.dropna(subset=feature_names + ["target"]).copy()
    X = valid[feature_names]
    y = valid["target"]
    return X, y, feature_names


def engineer_latest_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    """Extract the most recent feature row for live inference."""
    X_all, _, feature_names = engineer_features(df.assign(close=df["close"]), horizon=1)
    # Recompute without dropping the very last row's target
    data = df.copy()
    close = data["close"].astype(float)
    high = data["high"].astype(float)
    low = data["low"].astype(float)
    volume = data["volume"].astype(float).replace(0, np.nan).ffill().fillna(1.0)
    log_ret = np.log(close / close.shift(1))

    for lag in (1, 2, 3, 6, 12, 24):
        data[f"ret_lag_{lag}"] = np.log(close / close.shift(lag))
    for win in (6, 12, 24, 48):
        data[f"vol_{win}"] = log_ret.rolling(win).std()
    data["vol_ratio_6_24"] = data["vol_6"] / (data["vol_24"] + 1e-9)

    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    ema_50 = close.ewm(span=50, adjust=False).mean()
    data["ema_12_26_diff"] = (ema_12 - ema_26) / (close + 1e-9)
    data["ema_close_50_ratio"] = (close - ema_50) / (ema_50 + 1e-9)

    macd = ema_12 - ema_26
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    data["macd_hist"] = (macd - macd_signal) / (close + 1e-9)

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / (loss + 1e-9)
    data["rsi_14"] = 100.0 - (100.0 / (1.0 + rs))

    sma_20 = close.rolling(20).mean()
    std_20 = close.rolling(20).std()
    upper_bb = sma_20 + 2.0 * std_20
    lower_bb = sma_20 - 2.0 * std_20
    data["bb_pct_b"] = (close - lower_bb) / (upper_bb - lower_bb + 1e-9)
    data["bb_width"] = (upper_bb - lower_bb) / (sma_20 + 1e-9)

    data["hl_range"] = (high - low) / (close + 1e-9)
    vol_mean = volume.rolling(24).mean()
    vol_std = volume.rolling(24).std()
    data["volume_z_24"] = (volume - vol_mean) / (vol_std + 1e-9)

    if "timestamp" in data.columns:
        ts = pd.to_datetime(data["timestamp"], utc=True)
        hour = ts.dt.hour
        dow = ts.dt.dayofweek
        data["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
        data["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)
        data["dow_sin"] = np.sin(2 * np.pi * dow / 7.0)
        data["dow_cos"] = np.cos(2 * np.pi * dow / 7.0)

    latest = data[feature_names].iloc[[-1]].ffill(axis=0).fillna(0.0)
    return latest, feature_names
