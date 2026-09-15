"""
run_attribution.py — AquaTrace AIS Attribution Entry Point

Usage:
    python run_attribution.py

Reads AIS data and drift model output, runs the full attribution pipeline,
and writes ranked candidates to outputs/candidates.json.

All business logic lives in src/attribution.py.
"""

import json
import os
import sys

# Allow running from the aquatrace_ais/ root directory
sys.path.insert(0, os.path.dirname(__file__))

from src.attribution import run_attribution

AIS_FILE   = os.path.join(os.path.dirname(__file__), '..', 'data', 'sample', 'demo-ais.csv')
DRIFT_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'aquatrace_drift', 'outputs', 'drift_output.json')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'attribution')


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    result = run_attribution(AIS_FILE, DRIFT_FILE)

    output_path = os.path.join(OUTPUT_DIR, 'candidates.json')
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2, default=str)

    print(f"Saved {output_path} with {result['candidate_count']} candidates.")


if __name__ == '__main__':
    main()
