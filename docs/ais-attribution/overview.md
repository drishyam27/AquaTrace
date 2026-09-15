# Aquatrace‑AIS – Project Info

This repository contains the **Aquatrace‑AIS** pipeline, which ranks vessels that could be responsible for a maritime spill based on AIS data and an optional drift back‑track model.

- **`ais_loader.py`** – loads AIS CSV, normalises columns, filters by a geographic‑temporal window, and computes distance from the search origin.
- **`scoring.py`** – computes five sub‑scores (spatial, temporal, trajectory, drift, behaviour) and combines them using `DEFAULT_WEIGHTS`.
- **`run_attribution.py`** – orchestrates the workflow, reads an optional drift JSON (`../../aquatrace_drift/outputs/drift_output.json`), calls the loader and scorer, ranks vessels, and writes `outputs/attribution/candidates.json`.
- **`project_info/`** – holds documentation files (e.g., this `info.md`).

## Quick start
```powershell
# Activate the virtual environment
.\venv\Scripts\Activate.ps1

# Run the demo (uses demo AIS CSV and a fallback search window)
python run_attribution.py
```
The results are saved to `outputs/attribution/candidates.json`.

## Detailed Overview
### 1️⃣ What the project does
The goal is to **identify which vessels are most likely responsible for a marine pollutant discharge**. It combines two data sources:
- **AIS broadcasts** (position, speed, heading, vessel type, timestamps) from commercial ships.
- **Drift model output** (optional) that simulates how the pollutant moves with currents.
The pipeline:
1. Defines a *search window* – a geographic circle (center lat/lon, radius) and a time interval when the discharge likely occurred.
2. Loads AIS records, filters to only those inside the window, and calculates each record’s distance from the centre.
3. Scores each vessel on:
   * **Spatial proximity** – how close it got to the origin.
   * **Temporal proximity** – how close its timestamps are to the estimated discharge time.
   * **Trajectory similarity** – overall closeness of its track to the centre.
   * **Drift alignment** – minimum distance from any point on the drift back‑track path.
   * **Behaviour anomalies** – penalises long AIS gaps (> 30 min) and other irregularities.
4. Combines the five sub‑scores using configurable weights (`DEFAULT_WEIGHTS`).
5. Ranks vessels by the total score and outputs a JSON with rich evidence.

### 2️⃣ Core Modules
| Module | Primary responsibilities |
|--------|--------------------------|
| `ais_loader.py` | • Read CSV → `pandas.DataFrame`.<br>• Rename columns to a canonical schema (`mmsi`, `timestamp`, `lat`, `lon`, …).<br>• Convert timestamps to UTC, drop rows missing essential fields.<br>• Filter by time window and compute `dist_from_origin` using the Haversine formula.<br>• Group rows by MMSI and return a dict of per‑vessel DataFrames. |
| `scoring.py` | • Implements helper functions `score_spatial`, `score_temporal`, `score_trajectory`, `score_drift`, `score_behaviour`.
• `score_vessel` aggregates those sub‑scores, attaches confidence levels, builds a result dict with evidence (minimum distances, time offsets, AIS gaps, track list). |
| `run_attribution.py` | • Looks for `../aquatrace_drift/outputs/drift_output.json`.
• If missing, falls back to a hard‑coded search window (lat ≈ 14.34, lon ≈ 42.13, radius ≈ 38 km, 6‑hour window).
• Calls the loader, loops over vessels, scores each, sorts, annotates rank, writes `outputs/attribution/candidates.json`. |
| `project_info/` | Holds documentation (this file, future design docs, changelogs, etc.). |

### 3️⃣ Data Formats
- **Input AIS CSV** – expected columns (some may be missing): `MMSI`, `BaseDateTime`, `LAT`, `LON`, `SOG`, `COG`, `VesselType`, `VesselName`.
- **Drift JSON (`drift_output.json`)** – typical structure:
  ```json
  {
    "ais_search_window": {
      "center_lat": <float>,
      "center_lon": <float>,
      "radius_km": <float>,
      "time_start": "YYYY‑MM‑DDTHH:MM:SS+00:00",
      "time_end": "YYYY‑MM‑DDTHH:MM:SS+00:00"
    },
    "backtrack": {
      "path": [{"lat": <float>, "lon": <float>}, …],
      "probable_discharge_time": "YYYY‑MM‑DDTHH:MM:SS+00:00"
    }
  }
  ```
- **Output JSON (`outputs/attribution/candidates.json`)** – a dict containing:
  * `data_mode` (e.g., `DEMO`)
  * `disclaimer`
  * `search_parameters` (the window used)
  * `weights_used`
  * `candidate_count`
  * `candidates`: list of per‑vessel dicts with fields `mmsi`, `vessel_name`, `vessel_type`, `score`, `confidence`, `component_scores`, `evidence`, `ais_track`, `weights_used`, `disclaimer`.

### 4️⃣ How to run & test
1. **Activate virtualenv** (already present in `venv`).
2. **Run the demo** – `python run_attribution.py`. It will create `outputs/attribution/candidates.json`.
3. **Run unit test** (added earlier):
   ```bash
   pytest C:/Users/zaid/.gemini/antigravity-ide/brain/1032746f-f960-44ec-9926-1a550c1cd169/test_ais_pipeline.py
   ```
   The test checks that the demo CSV loads, a vessel is scored, and the result serialises.

### 5️⃣ Customisation & Extension
- **Weight tuning** – edit `DEFAULT_WEIGHTS` in `scoring.py` to give more importance to spatial vs. temporal vs. drift.
- **Different search windows** – modify the fallback dict in `run_attribution.py` or supply a proper `drift_output.json`.
- **Additional filters** – add logic in `load_and_filter_ais` (e.g., filter by `vessel_type == 'Tanker'` or speed thresholds).
- **Enhanced drift integration** – switch from a static JSON to a live coupling with a hydrodynamic model (OpenDrift, GNOME, etc.).
- **Visualization** – export the scored vessels to a map (e.g., Folium, Kepler.gl) for a visual inspection of tracks.

### 6️⃣ Dependencies
- **Python 3.12** (compatible with the provided virtual environment).
- **pandas** – data manipulation.
- **numpy**, **scipy** – used indirectly by pandas and for distance calculations.
- **json** – standard library for reading/writing JSON.
- **pytest** (optional) – for running the test suite.

---
*This expanded documentation was generated by Antigravity to give you a full picture of what the Aquatrace‑AIS project does, how its pieces fit together, and how you can run, test, and extend it.*
