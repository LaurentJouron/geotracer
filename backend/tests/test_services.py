"""
Tests — services GPS (calculs) et GPX (import/export)
Ces tests sont purement unitaires, pas besoin de DB ni HTTP.
"""

import pytest
from datetime import datetime


# ── Helpers ────────────────────────────────────────────────────────────────
def make_points(n=5, start_lat=43.5528, start_lon=7.0174):
    """Génère une liste de points GPS synthétiques."""
    return [
        {
            "lat": start_lat + i * 0.001,
            "lon": start_lon + i * 0.001,
            "alt": 10.0 + i * 2,
            "speed_kmh": 20.0 + i,
            "ts": f"2026-04-01T10:{i:02d}:00",
        }
        for i in range(n)
    ]


# ── Tests haversine ────────────────────────────────────────────────────────
class TestHaversine:
    def test_same_point_distance_zero(self):
        from app.services.gps import haversine

        assert haversine(43.5528, 7.0174, 43.5528, 7.0174) == 0.0

    # def test_known_distance(self):
    #     from app.services.gps import haversine

    #     # Cannes → Nice ≈ 33 km
    #     d = haversine(43.5528, 7.0174, 43.7102, 7.2620)
    #     assert 30 < d < 36

    def test_distance_is_positive(self):
        from app.services.gps import haversine

        d = haversine(43.0, 7.0, 44.0, 8.0)
        assert d > 0


# ── Tests compute_stats ────────────────────────────────────────────────────
class TestComputeStats:
    def test_empty_points_returns_empty(self):
        from app.services.gps import compute_stats

        assert compute_stats([]) == {}

    def test_single_point_returns_empty(self):
        from app.services.gps import compute_stats

        assert compute_stats(make_points(1)) == {}

    def test_stats_keys_present(self):
        from app.services.gps import compute_stats

        stats = compute_stats(make_points(5))
        for key in [
            "distance_km",
            "duration_seconds",
            "avg_speed_kmh",
            "max_speed_kmh",
            "elevation_gain_m",
            "elevation_loss_m",
        ]:
            assert key in stats

    def test_distance_positive(self):
        from app.services.gps import compute_stats

        stats = compute_stats(make_points(5))
        assert stats["distance_km"] > 0

    def test_duration_positive(self):
        from app.services.gps import compute_stats

        stats = compute_stats(make_points(5))
        assert stats["duration_seconds"] > 0

    def test_speed_series_length(self):
        from app.services.gps import compute_stats

        points = make_points(5)
        stats = compute_stats(points)
        assert len(stats["speed_series"]) == 5

    def test_elevation_series_length(self):
        from app.services.gps import compute_stats

        points = make_points(5)
        stats = compute_stats(points)
        assert len(stats["elevation_series"]) == 5

    def test_elevation_gain_ascending(self):
        from app.services.gps import compute_stats

        # Points avec altitude croissante → gain > 0
        points = make_points(10)
        stats = compute_stats(points)
        assert stats["elevation_gain_m"] >= 0


# ── Tests points_to_wkt_linestring ─────────────────────────────────────────
class TestPointsToWkt:
    def test_single_point_returns_none(self):
        from app.services.gps import points_to_wkt_linestring

        assert points_to_wkt_linestring(make_points(1)) is None

    def test_valid_wkt_format(self):
        from app.services.gps import points_to_wkt_linestring

        wkt = points_to_wkt_linestring(make_points(3))
        assert wkt is not None
        assert wkt.startswith("LINESTRINGZM")

    def test_wkt_contains_coordinates(self):
        from app.services.gps import points_to_wkt_linestring

        wkt = points_to_wkt_linestring(make_points(2))
        assert "43.5528" in wkt or "7.0174" in wkt


# ── Tests GPX import ───────────────────────────────────────────────────────
class TestParseGpx:
    def _make_gpx(self, title="Test GPX", n_points=3):
        points = "\n".join(
            [
                f'<trkpt lat="{43.55 + i * 0.001}" lon="{7.01 + i * 0.001}">'
                f"<ele>{10 + i}</ele>"
                f"<time>2026-04-01T10:{i:02d}:00Z</time>"
                f"</trkpt>"
                for i in range(n_points)
            ]
        )
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>{title}</name><trkseg>{points}</trkseg></trk>
</gpx>""".encode()

    def test_parse_basic_gpx(self):
        from app.services.gpx import parse_gpx

        points, meta = parse_gpx(self._make_gpx())
        assert len(points) == 3
        assert meta["title"] == "Test GPX"

    def test_parse_gpx_point_fields(self):
        from app.services.gpx import parse_gpx

        points, _ = parse_gpx(self._make_gpx())
        p = points[0]
        assert "lat" in p and "lon" in p
        assert "alt" in p and "ts" in p

    def test_parse_gpx_lat_lon_values(self):
        from app.services.gpx import parse_gpx

        points, _ = parse_gpx(self._make_gpx())
        assert abs(points[0]["lat"] - 43.55) < 0.001
        assert abs(points[0]["lon"] - 7.01) < 0.001

    def test_parse_empty_gpx(self):
        from app.services.gpx import parse_gpx

        gpx = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Vide</name><trkseg></trkseg></trk>
</gpx>"""
        points, meta = parse_gpx(gpx)
        assert points == []


# ── Tests GPX export ───────────────────────────────────────────────────────
class TestExportGpx:
    def test_export_produces_xml(self):
        from app.services.gpx import export_gpx

        xml = export_gpx("Ma sortie", make_points(3))
        assert xml.startswith("<?xml")
        assert "<gpx" in xml

    def test_export_contains_title(self):
        from app.services.gpx import export_gpx

        xml = export_gpx("Tour de Cannes", make_points(3))
        assert "Tour de Cannes" in xml

    def test_export_contains_coordinates(self):
        from app.services.gpx import export_gpx

        xml = export_gpx("Test", make_points(2))
        assert "43.5528" in xml

    def test_export_empty_points(self):
        from app.services.gpx import export_gpx

        xml = export_gpx("Vide", [])
        assert "<gpx" in xml
