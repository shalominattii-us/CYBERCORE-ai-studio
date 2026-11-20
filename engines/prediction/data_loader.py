"""Public market data loader with automatic synthetic fallback."""

from __future__ import annotations

import time
from typing import Tuple
import numpy as np
import pandas as pd
import requests


COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "XRP": "ripple",
    "ADA": "cardano",
    "AVAX": "avalanche-2",
    "LINK": "chainlink",
}


def fetch_market_data(
    symbol: str = "BTC",
    days: int = 90,
    timeout: int = 8,
) -> Tuple[pd.DataFrame, str]:
    """Fetch hourly/daily OHLCV-like market data from CoinGecko public API.

    Falls back to a realistic regime-switching synthetic series if the API
    is unreachable or rate-limited.
    """
    symbol_upper = symbol.upper().strip()
    coin_id = COINGECKO_IDS.get(symbol_upper, symbol_upper.lower())
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
    params = {"vs_currency": "usd", "days": str(days)}

    try:
        resp = requests.get(url, params=params, timeout=timeout)
        if resp.status_code == 200:
            payload = resp.json()
            prices = payload.get("prices", [])
            volumes = payload.get("total_volumes", [])
            if len(prices) >= 60:
                df = pd.DataFrame(prices, columns=["timestamp", "close"])
                vol_df = pd.DataFrame(volumes, columns=["timestamp", "volume"])
                df["volume"] = vol_df["volume"].values[: len(df)]
                df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
                df = df.sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)
                # Approximate high/low/open from close series
                df["open"] = df["close"].shift(1).fillna(df["close"])
                spread = df["close"].pct_change().abs().rolling(6).mean().fillna(0.005)
                df["high"] = df[["open", "close"]].max(axis=1) * (1.0 + spread * 0.5)
                df["low"] = df[["open", "close"]].min(axis=1) * (1.0 - spread * 0.5)
                return df, f"coingecko:{coin_id}"
    except Exception:
        pass

    return generate_synthetic_market_data(symbol_upper, periods=max(days * 24, 500)), f"synthetic:{symbol_upper}"


def generate_synthetic_market_data(symbol: str = "BTC", periods: int = 720) -> pd.DataFrame:
    """Generate realistic regime-switching financial time series for prototyping."""
    seed = sum(ord(c) for c in symbol) + 42
    rng = np.random.default_rng(seed)

    base_price = {"BTC": 68000.0, "ETH": 3400.0, "SOL": 165.0}.get(symbol, 100.0)
    returns = np.zeros(periods)
    vol = 0.012
    regime_drift = 0.0002

    for t in range(1, periods):
        if t % 120 == 0:
            regime_drift = rng.choice([-0.0005, 0.0001, 0.0006])
            vol = rng.uniform(0.007, 0.022)
        shock = rng.normal(0, vol)
        mean_rev = -0.05 * returns[t - 1]
        returns[t] = regime_drift + mean_rev + shock

    close = base_price * np.exp(np.cumsum(returns))
    now = int(time.time())
    timestamps = pd.to_datetime(
        [now - (periods - i) * 3600 for i in range(periods)], unit="s", utc=True
    )
    open_p = np.roll(close, 1)
    open_p[0] = close[0]
    high = np.maximum(open_p, close) * (1.0 + rng.uniform(0.001, 0.008, periods))
    low = np.minimum(open_p, close) * (1.0 - rng.uniform(0.001, 0.008, periods))
    volume = rng.lognormal(mean=14.0, sigma=0.6, size=periods)

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": open_p,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
    )
