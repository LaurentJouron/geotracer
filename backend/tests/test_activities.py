# """
# Tests — activités (CRUD, points GPS, stats, GPX)
# """

# import json
# import pytest
# from datetime import datetime


# @pytest.mark.asyncio
# class TestCreateActivity:
#     async def test_create_activity_success(self, auth_client):
#         response = await auth_client.post(
#             "/activities/",
#             json={
#                 "user_id": auth_client.user_id,
#                 "title": "Tour du Suquet",
#             },
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert data["title"] == "Tour du Suquet"
#         assert data["is_live"] == 1
#         assert data["user_id"] == auth_client.user_id

#     async def test_create_activity_default_title(self, auth_client):
#         response = await auth_client.post(
#             "/activities/",
#             json={
#                 "user_id": auth_client.user_id,
#             },
#         )
#         assert response.status_code == 200
#         assert response.json()["title"] == "Sortie vélo"

#     async def test_create_activity_has_started_at(self, auth_client):
#         response = await auth_client.post(
#             "/activities/",
#             json={
#                 "user_id": auth_client.user_id,
#                 "title": "Test dates",
#             },
#         )
#         data = response.json()
#         assert data["started_at"] is not None
#         assert data["finished_at"] is None


# @pytest.mark.asyncio
# class TestGetActivity:
#     async def test_get_existing_activity(self, auth_client, activity):
#         activity_id = activity["id"]
#         response = await auth_client.get(f"/activities/{activity_id}")
#         assert response.status_code == 200
#         assert response.json()["id"] == activity_id

#     async def test_get_nonexistent_activity(self, auth_client):
#         response = await auth_client.get("/activities/999999")
#         assert response.status_code == 404

#     async def test_get_activity_points_empty(self, auth_client, activity):
#         response = await auth_client.get(
#             f"/activities/{activity['id']}/points"
#         )
#         assert response.status_code == 200
#         assert response.json() == []


# @pytest.mark.asyncio
# class TestAddGpsPoints:
#     async def test_add_point_success(self, auth_client, activity):
#         response = await auth_client.post(
#             f"/activities/{activity['id']}/points",
#             json={
#                 "lat": 43.5528,
#                 "lon": 7.0174,
#                 "alt": 12.5,
#                 "speed_kmh": 22.4,
#                 "ts": "2026-04-01T10:00:00",
#             },
#         )
#         assert response.status_code == 200
#         assert response.json()["total_points"] == 1

#     async def test_add_multiple_points(self, auth_client, activity):
#         points = [
#             {
#                 "lat": 43.55,
#                 "lon": 7.01,
#                 "alt": 10.0,
#                 "speed_kmh": 20.0,
#                 "ts": f"2026-04-01T10:0{i}:00",
#             }
#             for i in range(5)
#         ]
#         for p in points:
#             await auth_client.post(
#                 f"/activities/{activity['id']}/points", json=p
#             )

#         response = await auth_client.get(
#             f"/activities/{activity['id']}/points"
#         )
#         assert len(response.json()) >= 5

#     async def test_add_point_nonexistent_activity(self, auth_client):
#         response = await auth_client.post(
#             "/activities/999999/points", json={"lat": 43.5, "lon": 7.0}
#         )
#         assert response.status_code == 404


# @pytest.mark.asyncio
# class TestFinishActivity:
#     async def test_finish_activity_no_points(self, auth_client, activity):
#         response = await auth_client.post(
#             f"/activities/{activity['id']}/finish"
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert data["is_live"] == 0
#         assert data["finished_at"] is not None

#     async def test_finish_activity_with_points(self, auth_client):
#         # Créer une activité avec points
#         act = await auth_client.post(
#             "/activities/",
#             json={"user_id": auth_client.user_id, "title": "Finish test"},
#         )
#         act_id = act.json()["id"]

#         # Ajouter des points GPS réalistes
#         points = [
#             {
#                 "lat": 43.5528 + i * 0.001,
#                 "lon": 7.0174,
#                 "alt": 10.0 + i,
#                 "speed_kmh": 25.0,
#                 "ts": f"2026-04-01T10:{i:02d}:00",
#             }
#             for i in range(5)
#         ]
#         for p in points:
#             await auth_client.post(f"/activities/{act_id}/points", json=p)

#         response = await auth_client.post(f"/activities/{act_id}/finish")
#         assert response.status_code == 200
#         data = response.json()
#         assert data["is_live"] == 0
#         assert data["distance_km"] is not None
#         assert data["distance_km"] > 0

#     async def test_finish_nonexistent_activity(self, auth_client):
#         response = await auth_client.post("/activities/999999/finish")
#         assert response.status_code == 404


# @pytest.mark.asyncio
# class TestActivityStats:
#     async def test_stats_empty_activity(self, auth_client, activity):
#         response = await auth_client.get(f"/activities/{activity['id']}/stats")
#         assert response.status_code == 200
#         assert response.json() == {}

#     async def test_stats_with_points(self, auth_client):
#         act = await auth_client.post(
#             "/activities/",
#             json={"user_id": auth_client.user_id, "title": "Stats test"},
#         )
#         act_id = act.json()["id"]

#         points = [
#             {
#                 "lat": 43.55 + i * 0.001,
#                 "lon": 7.01,
#                 "alt": 10.0,
#                 "speed_kmh": 30.0,
#                 "ts": f"2026-04-01T10:{i:02d}:00",
#             }
#             for i in range(3)
#         ]
#         for p in points:
#             await auth_client.post(f"/activities/{act_id}/points", json=p)

#         response = await auth_client.get(f"/activities/{act_id}/stats")
#         assert response.status_code == 200
#         data = response.json()
#         assert "distance_km" in data
#         assert "duration_seconds" in data
#         assert "avg_speed_kmh" in data
#         assert data["distance_km"] > 0


# @pytest.mark.asyncio
# class TestDeleteActivity:
#     async def test_delete_activity(self, auth_client):
#         act = await auth_client.post(
#             "/activities/",
#             json={"user_id": auth_client.user_id, "title": "À supprimer"},
#         )
#         act_id = act.json()["id"]

#         response = await auth_client.delete(f"/activities/{act_id}")
#         assert response.status_code == 200
#         assert response.json()["status"] == "deleted"

#         # Vérifier que c'est bien supprimé
#         response = await auth_client.get(f"/activities/{act_id}")
#         assert response.status_code == 404

#     async def test_delete_nonexistent_activity(self, auth_client):
#         response = await auth_client.delete("/activities/999999")
#         assert response.status_code == 404


# @pytest.mark.asyncio
# class TestGpxExport:
#     async def test_export_gpx_empty(self, auth_client, activity):
#         response = await auth_client.get(
#             f"/activities/{activity['id']}/export/gpx"
#         )
#         assert response.status_code == 200
#         assert "gpx" in response.headers[
#             "content-type"
#         ].lower() or response.headers.get("content-disposition", "").endswith(
#             ".gpx"
#         )

#     async def test_export_gpx_nonexistent(self, auth_client):
#         response = await auth_client.get("/activities/999999/export/gpx")
#         assert response.status_code == 404
