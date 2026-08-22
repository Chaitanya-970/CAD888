"""
Role 3 - quick manual test for dbscan_hotspots.py
Run with: python test_dbscan_hotspots.py
No API keys, no network - pure math against a small hand-built dataset.
"""

from dbscan_hotspots import find_hotspots, summarize_hotspots


def make_report(lat, lng, incident_type="poor_lighting"):
    return {"latitude": lat, "longitude": lng, "incident_type": incident_type}


if __name__ == "__main__":
    # 3 points tightly packed together (~10-20m apart) = should form ONE cluster
    cluster_a = [
        make_report(20.2700, 85.8410),
        make_report(20.27002, 85.84102),
        make_report(20.26998, 85.84098),
    ]
    # 1 point far away from everything = should be noise (-1)
    isolated = [make_report(20.3560, 85.8190, "theft")]

    reports = cluster_a + isolated
    result = find_hotspots(reports, eps_meters=150, min_samples=2)

    cluster_ids = [r["cluster_id"] for r in result[:3]]
    isolated_id = result[3]["cluster_id"]

    assert len(set(cluster_ids)) == 1, "the 3 close points should share one cluster_id"
    assert cluster_ids[0] != -1, "the 3 close points should NOT be noise"
    assert isolated_id == -1, "the far-away lone point should be noise (-1)"

    print("PASS: 3 nearby reports formed one cluster:", cluster_ids)
    print("PASS: isolated report correctly flagged as noise:", isolated_id)

    summary = summarize_hotspots(result)
    assert len(summary) == 1, "exactly one hotspot should be summarized (noise excluded)"
    print("PASS: hotspot summary:", summary)

    print("\nAll dbscan_hotspots tests passed.")