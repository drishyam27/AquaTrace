"""
aquatrace_ais.src.scoring
~~~~~~~~~~~~~~~~~~~~~~~~~~
Multi-factor vessel attribution scoring.

Five scoring dimensions:
  1. Spatial   — how close the vessel got to the spill origin
  2. Temporal  — how closely timed the vessel was to the discharge event
  3. Trajectory— how directly the vessel's path intersects the origin zone
  4. Drift     — how well the vessel position aligns with the backtrack path
  5. Behaviour — anomaly flags (AIS gaps, unusual speed, etc.)

Do NOT modify scoring weights or formulas without consulting the team.
"""

import pandas as pd
from .utils import haversine_km
from .ais_loader import detect_ais_gaps

DEFAULT_WEIGHTS = {
    'spatial':    0.25,
    'temporal':   0.25,
    'trajectory': 0.20,
    'drift':      0.20,
    'behaviour':  0.10,
}


def score_spatial(
    vessel_df: pd.DataFrame,
    origin_lat: float,
    origin_lon: float,
    radius_km: float,
) -> tuple:
    """
    Score based on minimum distance from the vessel track to the spill origin.

    Returns:
        (score 0–100, min_dist_km)
    """
    min_dist = vessel_df.apply(
        lambda r: haversine_km(r['lat'], r['lon'], origin_lat, origin_lon), axis=1
    ).min()
    score = max(0.0, 100.0 * (1.0 - min_dist / radius_km))
    return round(score, 1), round(min_dist, 2)


def score_temporal(
    vessel_df: pd.DataFrame,
    discharge_time_iso: str,
    time_window_hours: float = 6.0,
) -> tuple:
    """
    Score based on how close in time the vessel was to the discharge event.

    Returns:
        (score 0–100, min_time_diff_hours)
    """
    t_discharge = pd.Timestamp(discharge_time_iso)
    diffs = vessel_df['timestamp'].apply(
        lambda t: abs((t - t_discharge).total_seconds() / 3600.0)
    )
    min_diff = diffs.min()
    score = max(0.0, 100.0 * (1.0 - min_diff / time_window_hours))
    return round(score, 1), round(min_diff, 2)


def score_trajectory(
    vessel_df: pd.DataFrame,
    origin_lat: float,
    origin_lon: float,
) -> tuple:
    """
    Score based on how closely the vessel trajectory passes the origin.
    Uses a fixed 50 km reference radius.

    Returns:
        (score 0–100, min_track_dist_km)
    """
    min_dist = vessel_df.apply(
        lambda r: haversine_km(r['lat'], r['lon'], origin_lat, origin_lon), axis=1
    ).min()
    score = max(0.0, 100.0 * (1.0 - min_dist / 50.0))
    return round(score, 1), round(min_dist, 2)


def score_drift(vessel_df: pd.DataFrame, backtrack_path: list) -> tuple:
    """
    Score based on proximity between the vessel track and the oil drift backtrack path.

    Returns:
        (score 0–100, min_drift_dist_km)
    """
    if not backtrack_path:
        return 50.0, 0.0

    min_dist = float('inf')
    for pt in backtrack_path:
        for _, r in vessel_df.iterrows():
            min_dist = min(min_dist, haversine_km(r['lat'], r['lon'], pt['lat'], pt['lon']))

    score = max(0.0, 100.0 * (1.0 - min_dist / 30.0))
    return round(score, 1), round(min_dist, 2)


def score_behaviour(vessel_df: pd.DataFrame, ais_gaps: list) -> tuple:
    """
    Score based on behavioural anomalies: AIS gaps, unusual patterns.

    Returns:
        (score 0–100, anomalies list)
    """
    score, anomalies = 0.0, []
    if ais_gaps:
        score += 40.0
        anomalies.append({
            'type':   'AIS_GAP',
            'detail': f'{len(ais_gaps)} gap(s) detected.',
        })
    return round(min(100.0, score), 1), anomalies


def score_vessel(
    vessel_df: pd.DataFrame,
    mmsi: str,
    origin_lat: float,
    origin_lon: float,
    radius_km: float,
    discharge_time_iso: str,
    backtrack_path: list = None,
    weights: dict = None,
) -> dict:
    """
    Compute the composite attribution score for a single vessel.

    Args:
        vessel_df:          AIS DataFrame for the vessel.
        mmsi:               MMSI identifier string.
        origin_lat/lon:     Spill origin coordinates.
        radius_km:          Spatial search radius.
        discharge_time_iso: Estimated discharge time (ISO 8601).
        backtrack_path:     List of {'lat', 'lon'} drift path points.
        weights:            Score component weights (default: DEFAULT_WEIGHTS).

    Returns:
        Dict containing score, confidence, evidence, and AIS track.
    """
    if weights is None:
        weights = DEFAULT_WEIGHTS

    ais_gaps = detect_ais_gaps(vessel_df)

    s_sp, dist_km   = score_spatial(vessel_df, origin_lat, origin_lon, radius_km)
    s_tm, time_diff = score_temporal(vessel_df, discharge_time_iso)
    s_tr, track_dist= score_trajectory(vessel_df, origin_lat, origin_lon)
    s_dr, drift_dist= score_drift(vessel_df, backtrack_path or [])
    s_bh, anomalies = score_behaviour(vessel_df, ais_gaps)

    total = round(
        weights['spatial']    * s_sp
        + weights['temporal']   * s_tm
        + weights['trajectory'] * s_tr
        + weights['drift']      * s_dr
        + weights['behaviour']  * s_bh,
        1,
    )

    confidence = 'HIGH' if total >= 70 else ('MEDIUM' if total >= 45 else 'LOW')

    v_name = (
        vessel_df['vessel_name'].iloc[0]
        if 'vessel_name' in vessel_df.columns
        else f'VESSEL-{mmsi}'
    )
    v_type = (
        vessel_df['vessel_type'].iloc[0]
        if 'vessel_type' in vessel_df.columns
        else 'Unknown'
    )
    track = [
        {'lat': float(r['lat']), 'lon': float(r['lon']), 'time': r['timestamp'].isoformat()}
        for _, r in vessel_df.iterrows()
    ]

    return {
        'mmsi':         str(mmsi),
        'vessel_name':  str(v_name),
        'vessel_type':  str(v_type),
        'score':        total,
        'confidence':   confidence,
        'component_scores': {
            'spatial':    s_sp,
            'temporal':   s_tm,
            'trajectory': s_tr,
            'drift':      s_dr,
            'behaviour':  s_bh,
        },
        'evidence': {
            'min_distance_from_origin_km':     dist_km,
            'time_offset_from_discharge_hours': time_diff,
            'ais_gaps':   ais_gaps,
            'anomalies':  anomalies,
        },
        'ais_track':    track,
        'weights_used': weights,
        'disclaimer':   'Analytical investigation priority score, not a legal determination.',
    }
