"""
aquatrace_ais.src.ais_loader
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
AIS CSV loading, column normalisation, spatial/temporal filtering,
and AIS gap detection.
"""

import pandas as pd
from .utils import haversine_km


def load_and_filter_ais(
    csv_path: str,
    center_lat: float,
    center_lon: float,
    radius_km: float,
    time_start_iso: str,
    time_end_iso: str,
) -> dict:
    """
    Load an AIS CSV file and return vessels within the specified
    spatio-temporal search window.

    Args:
        csv_path:       Path to the AIS CSV file.
        center_lat:     Latitude of the spill origin (decimal degrees).
        center_lon:     Longitude of the spill origin (decimal degrees).
        radius_km:      Spatial search radius around the origin (km).
        time_start_iso: ISO 8601 start of the time window.
        time_end_iso:   ISO 8601 end of the time window.

    Returns:
        Dict mapping MMSI string → chronologically sorted DataFrame.
    """
    df = pd.read_csv(csv_path)

    # Normalise column names to a consistent internal schema
    col_map = {
        'MMSI':         'mmsi',
        'BaseDateTime': 'timestamp',
        'LAT':          'lat',
        'LON':          'lon',
        'SOG':          'sog',
        'COG':          'cog',
        'VesselType':   'vessel_type',
        'VesselName':   'vessel_name',
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
    df = df.dropna(subset=['timestamp', 'lat', 'lon'])

    # Temporal filter
    t_start = pd.Timestamp(time_start_iso)
    t_end   = pd.Timestamp(time_end_iso)
    df = df[(df['timestamp'] >= t_start) & (df['timestamp'] <= t_end)]

    # Spatial filter — keep only rows within radius_km of origin
    df['dist_from_origin'] = df.apply(
        lambda row: haversine_km(row['lat'], row['lon'], center_lat, center_lon),
        axis=1,
    )
    df_near = df[df['dist_from_origin'] <= radius_km]

    # Group by vessel and sort each track chronologically
    vessels = {}
    for mmsi, group in df_near.groupby('mmsi'):
        vessels[str(mmsi)] = group.sort_values('timestamp').reset_index(drop=True)

    return vessels


def detect_ais_gaps(vessel_df: pd.DataFrame, gap_threshold_minutes: float = 30) -> list:
    """
    Identify temporal gaps in an AIS vessel track.

    Args:
        vessel_df:              DataFrame for a single vessel.
        gap_threshold_minutes:  Minimum gap duration (minutes) to flag.

    Returns:
        List of dicts, each describing one gap:
        {'gap_start': ISO str, 'gap_end': ISO str, 'gap_duration_minutes': float}
    """
    if len(vessel_df) < 2:
        return []

    gaps = []
    times = vessel_df['timestamp'].tolist()
    for i in range(1, len(times)):
        gap_min = (times[i] - times[i - 1]).total_seconds() / 60.0
        if gap_min > gap_threshold_minutes:
            gaps.append({
                'gap_start':            times[i - 1].isoformat(),
                'gap_end':              times[i].isoformat(),
                'gap_duration_minutes': round(gap_min, 1),
            })
    return gaps
