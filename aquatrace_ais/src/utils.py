"""
aquatrace_ais.src.utils
~~~~~~~~~~~~~~~~~~~~~~~
Shared mathematical utilities used across the AIS attribution pipeline.

Centralises haversine_km() which was previously duplicated in both
ais_loader.py and scoring.py.
"""

import math


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute the great-circle distance between two points on Earth (in km).

    Uses the Haversine formula with Earth radius = 6371 km.

    Args:
        lat1, lon1: Latitude and longitude of the first point (decimal degrees).
        lat2, lon2: Latitude and longitude of the second point (decimal degrees).

    Returns:
        Distance in kilometres.
    """
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    a = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))
