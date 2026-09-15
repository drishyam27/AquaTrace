"""
aquatrace_ais.src.attribution
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Vessel attribution workflow.

Orchestrates loading → scoring → ranking for a given spill event.
Extracted from run_attribution.py so the logic is importable and testable.
"""

import json
import os

from .ais_loader import load_and_filter_ais
from .scoring import score_vessel, DEFAULT_WEIGHTS

# Default fallback if no drift output is available
_FALLBACK_SEARCH_WINDOW = {
    'center_lat': 14.3389,
    'center_lon': 42.1287,
    'radius_km':  38.0,
    'time_start': '2024-03-14T22:32:00+00:00',
    'time_end':   '2024-03-15T04:32:00+00:00',
}
_FALLBACK_DISCHARGE_TIME = '2024-03-14T22:32:00+00:00'


def load_drift_data(drift_file_path: str) -> dict:
    """
    Load drift model output JSON.

    Returns a dict with keys: search_window, backtrack_path, discharge_time.
    Falls back to hardcoded demo values if the file is missing.
    """
    if not os.path.exists(drift_file_path):
        print(f'WARNING: {drift_file_path} not found. Using fallback search window.')
        return {
            'search_window':   _FALLBACK_SEARCH_WINDOW,
            'backtrack_path':  [],
            'discharge_time':  _FALLBACK_DISCHARGE_TIME,
        }

    with open(drift_file_path) as f:
        drift_data = json.load(f)

    return {
        'search_window':  drift_data['ais_search_window'],
        'backtrack_path': drift_data['backtrack']['path'],
        'discharge_time': drift_data['backtrack']['probable_discharge_time'],
    }


def run_attribution(ais_path: str, drift_file_path: str, weights: dict = None) -> dict:
    """
    Full attribution pipeline for a single spill event.

    1. Load drift model output to get the search window.
    2. Load and spatially/temporally filter AIS data.
    3. Score every vessel in the window.
    4. Rank by composite score (descending).

    Args:
        ais_path:        Path to the AIS CSV file.
        drift_file_path: Path to the drift model JSON output.
        weights:         Optional custom score weights.

    Returns:
        Attribution result dict suitable for JSON serialization.
    """
    if weights is None:
        weights = DEFAULT_WEIGHTS

    drift = load_drift_data(drift_file_path)
    sw    = drift['search_window']

    vessels = load_and_filter_ais(
        ais_path,
        sw['center_lat'],
        sw['center_lon'],
        sw['radius_km'],
        sw['time_start'],
        sw['time_end'],
    )

    candidates = [
        score_vessel(
            df, mmsi,
            sw['center_lat'], sw['center_lon'], sw['radius_km'],
            drift['discharge_time'],
            drift['backtrack_path'],
            weights,
        )
        for mmsi, df in vessels.items()
    ]

    candidates.sort(key=lambda x: x['score'], reverse=True)
    for i, c in enumerate(candidates):
        c['rank'] = i + 1

    return {
        'data_mode':        'DEMO',
        'disclaimer':       'Ranked investigation shortlist.',
        'search_parameters': sw,
        'weights_used':     weights,
        'candidate_count':  len(candidates),
        'candidates':       candidates,
    }
