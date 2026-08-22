"""
Role 3 - DBSCAN hotspot clustering (P3 stretch feature)
PS-17 Safe Route Mapping, plan section 5/6.

WHAT: Groups nearby incident reports into "hotspot" clusters, and separately
      flags isolated single reports as noise - not part of any real pattern.

WHY:  Plan section 5 (P3 tier): "Stops a single outlier report from being
      treated as a pattern." Without this, one random or malicious report
      sitting alone somewhere could visually look like a proper cluster on
      a map, when it's really just noise. This is the same spirit as the
      corroboration guard in explain_agent.py, just applied spatially
      across the whole seed dataset instead of per-segment.

HOW IT WORKS:
  DBSCAN (Density-Based Spatial Clustering) doesn't need you to say how many
  clusters exist ahead of time (unlike k-means) - it finds them by density:
  pick a point, look within a radius `eps`; if at least `min_samples` other
  points (including itself) are within that radius, they're all one cluster.
  A point with too few neighbors gets label -1 ("noise").

  GPS coordinates are in degrees, and a degree of longitude covers a
  different real-world distance depending on latitude - so naive Euclidean
  distance on raw lat/lng is wrong. We convert lat/lng to radians and use
  the haversine metric, which correctly measures great-circle distance on a
  sphere, and pass `eps` in actual meters (converted to radians) so the
  radius means the same real-world distance everywhere on the map.
"""

import json
import math

import numpy as np
from sklearn.cluster import DBSCAN

EARTH_RADIUS_METERS = 6_371_000


def find_hotspots(reports: list, eps_meters: float = 150, min_samples: int = 2) -> list:
    """
    Args:
      reports: list of dicts, each must have "latitude" and "longitude" keys
                (matches seed_incidents.json's shape exactly).
      eps_meters: max distance between two reports to count as neighbors.
                  Plan suggests ~100-150m segment size, so 150m is the default.
      min_samples: minimum reports (including the point itself) to form a
                    cluster. Plan section 5 says min_samples=2-3.

    Returns:
      The same list of report dicts, each with one new key added:
        "cluster_id": int - a shared id for reports in the same hotspot,
                             or -1 if this report is isolated noise.
      Also prints a short summary of how many hotspots vs noise points were found.
    """
    if not reports:
        return []

    coords_deg = np.array([[r["latitude"], r["longitude"]] for r in reports])
    coords_rad = np.radians(coords_deg)

    eps_rad = eps_meters / EARTH_RADIUS_METERS  # convert meters -> radians for haversine

    db = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine")
    labels = db.fit_predict(coords_rad)

    for report, label in zip(reports, labels):
        report["cluster_id"] = int(label)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int(np.sum(labels == -1))
    print(
        f"DBSCAN: {n_clusters} hotspot(s) found, {n_noise} isolated report(s) "
        f"treated as noise, out of {len(reports)} total reports."
    )
    return reports


def summarize_hotspots(reports_with_clusters: list) -> dict:
    """Groups reports by cluster_id and returns a summary per hotspot -
    useful for the frontend to render one marker per hotspot instead of
    one marker per individual report."""
    hotspots = {}
    for r in reports_with_clusters:
        cid = r["cluster_id"]
        if cid == -1:
            continue  # noise points aren't a hotspot
        hotspots.setdefault(cid, []).append(r)

    summary = {}
    for cid, members in hotspots.items():
        avg_lat = sum(m["latitude"] for m in members) / len(members)
        avg_lng = sum(m["longitude"] for m in members) / len(members)
        summary[cid] = {
            "report_count": len(members),
            "center_latitude": round(avg_lat, 6),
            "center_longitude": round(avg_lng, 6),
            "incident_types": sorted({m["incident_type"] for m in members}),
        }
    return summary


if __name__ == "__main__":
    with open("../data/seed_incidents.json") as f:
        reports = json.load(f)

    reports = find_hotspots(reports, eps_meters=150, min_samples=2)
    hotspots = summarize_hotspots(reports)

    print(f"\n{len(hotspots)} hotspot summary:")
    for cid, info in hotspots.items():
        print(f"  Hotspot {cid}: {info}")