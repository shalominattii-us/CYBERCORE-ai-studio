"""CLI entry point for the CYBERCORE Prediction Engine."""

from __future__ import annotations

import argparse
import json
from .ensemble import PredictionEngine


def main() -> None:
    parser = argparse.ArgumentParser(description="CYBERCORE Stacked Ensemble Prediction Engine")
    parser.add_argument("--symbol", type=str, default="BTC", help="Asset symbol (e.g., BTC, ETH, SOL)")
    parser.add_argument("--days", type=int, default=90, help="Historical lookback days")
    parser.add_argument("--horizon", type=int, default=1, help="Forecast horizon in steps")
    args = parser.parse_args()

    engine = PredictionEngine()
    result = engine.predict(symbol=args.symbol, days=args.days, horizon=args.horizon)
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
