"""Controlled multi-persona research, analysis, and projection studio."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List


PERSONA_CONFIGS: Dict[str, Dict[str, Any]] = {
    "athlete": {
        "title": "CyberGym Athlete Performance Lab",
        "domain": "Sports Science, Biomechanics & Competitive Telemetry",
        "postulate_frame": "Quantify physiological readiness, load-recovery balance, and peak-window execution.",
        "analysis_axes": [
            "Acute-to-Chronic Workload Ratio (ACWR)",
            "Neuromuscular Fatigue & HRV Readiness",
            "Tactical Decision Latency Under Pressure",
        ],
        "projection_horizons": ["Next Match / Session", "4-Week Mesocycle", "Season Peak"],
    },
    "research_analyst": {
        "title": "CyberGym Research Analyst Lab",
        "domain": "Quantitative Intelligence, Market & Systems Research",
        "postulate_frame": "Synthesize primary empirical signals, isolate causal drivers, and stress-test hypotheses.",
        "analysis_axes": [
            "Primary Signal-to-Noise Ratio",
            "Cross-Domain Structural Correlations",
            "Tail-Risk & Regime-Shift Sensitivity",
        ],
        "projection_horizons": ["30-Day Tactical", "90-Day Structural", "12-Month Macro"],
    },
    "constitutional_law_scholar": {
        "title": "CyberGym Constitutional Law Scholar Lab",
        "domain": "Constitutional Doctrine, Precedent & Institutional Governance",
        "postulate_frame": "Evaluate text, original public meaning, doctrinal precedent, and institutional separation of powers.",
        "analysis_axes": [
            "Textual & Structural Authority",
            "Controlling Precedent & Doctrinal Trajectory",
            "Institutional & Rights-Based Counterbalances",
        ],
        "projection_horizons": ["Immediate Injunctive Posture", "Appellate / Certiorari Horizon", "Long-Term Doctrinal Shift"],
    },
}


@dataclass
class LabSessionResult:
    lab_id: str
    persona: str
    title: str
    domain: str
    topic: str
    controlled_mode: bool
    timestamp_utc: str
    research_postulate: str
    structured_analysis: List[Dict[str, str]]
    projected_perspectives: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class CyberGymLab:
    """Controlled clean-room lab for research, analysis, and projected perspectives."""

    def run_session(self, persona: str, topic: str, controlled_mode: bool = True) -> LabSessionResult:
        key = persona.lower().strip()
        if key not in PERSONA_CONFIGS:
            raise ValueError(f"Unknown persona '{persona}'. Choose from: {list(PERSONA_CONFIGS.keys())}")

        cfg = PERSONA_CONFIGS[key]
        now = datetime.now(timezone.utc).isoformat()
        lab_id = f"cybergym-{key}-{int(datetime.now(timezone.utc).timestamp())}"

        structured_analysis = [
            {
                "axis": axis,
                "finding": f"[{cfg['title']}] Controlled evaluation of '{topic}' along {axis}.",
                "confidence": "HIGH" if controlled_mode else "EXPLORATORY",
            }
            for axis in cfg["analysis_axes"]
        ]

        projected_perspectives = [
            {
                "horizon": horizon,
                "scenario": "Base / Evidence-Weighted",
                "projection": f"Projected trajectory for '{topic}' over {horizon} grounded in {cfg['domain']}.",
                "confidence_band": "80% Controlled Interval",
            }
            for horizon in cfg["projection_horizons"]
        ]

        return LabSessionResult(
            lab_id=lab_id,
            persona=key,
            title=cfg["title"],
            domain=cfg["domain"],
            topic=topic,
            controlled_mode=controlled_mode,
            timestamp_utc=now,
            research_postulate=f"{cfg['postulate_frame']} Target: {topic}",
            structured_analysis=structured_analysis,
            projected_perspectives=projected_perspectives,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="CyberGym Clean Lab Studio CLI")
    parser.add_argument(
        "--persona",
        type=str,
        default="research_analyst",
        choices=list(PERSONA_CONFIGS.keys()),
        help="Lab persona",
    )
    parser.add_argument("--topic", type=str, required=True, help="Research topic or postulate")
    parser.add_argument("--uncontrolled", action="store_true", help="Disable strict controlled mode")
    args = parser.parse_args()

    lab = CyberGymLab()
    result = lab.run_session(persona=args.persona, topic=args.topic, controlled_mode=not args.uncontrolled)
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
