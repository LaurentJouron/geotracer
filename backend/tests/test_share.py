# """
# Tests — liens de partage courts (shares)
# """

# import pytest


# @pytest.mark.asyncio
# class TestCreateShare:
#     async def test_create_share_success(self, client, activity):
#         response = await client.post(
#             "/share/",
#             json={
#                 "activity_id": activity["id"],
#                 "username": "testuser",
#                 "api_url": "https://geoapi.laurentjouron.dev",
#                 "frontend_url": "https://geographix.laurentjouron.dev",
#             },
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert "token" in data
#         assert "short_url" in data
#         assert "watch_url" in data
#         assert len(data["token"]) > 0
#         assert data["activity_id"] if "activity_id" in data else True

#     async def test_create_share_token_is_short(self, client, activity):
#         response = await client.post(
#             "/share/",
#             json={
#                 "activity_id": activity["id"],
#                 "username": "testuser",
#             },
#         )
#         token = response.json()["token"]
#         # Token urlsafe(6) → ~8 caractères
#         assert len(token) <= 12

#     async def test_create_share_short_url_contains_token(
#         self, client, activity
#     ):
#         response = await client.post(
#             "/share/",
#             json={
#                 "activity_id": activity["id"],
#                 "username": "testuser",
#             },
#         )
#         data = response.json()
#         assert data["token"] in data["short_url"]

#     async def test_create_share_watch_url_contains_activity_id(
#         self, client, activity
#     ):
#         response = await client.post(
#             "/share/",
#             json={
#                 "activity_id": activity["id"],
#                 "username": "testuser",
#             },
#         )
#         watch_url = response.json()["watch_url"]
#         assert str(activity["id"]) in watch_url


# @pytest.mark.asyncio
# class TestFollowShare:
#     async def test_follow_valid_token_redirects(self, client, activity):
#         create = await client.post(
#             "/share/",
#             json={
#                 "activity_id": activity["id"],
#                 "username": "testuser",
#             },
#         )
#         token = create.json()["token"]

#         # Ne pas suivre la redirection
#         response = await client.get(
#             f"/share/{token}",
#             follow_redirects=False,
#         )
#         assert response.status_code == 302
#         assert "watch.html" in response.headers["location"]

#     async def test_follow_invalid_token(self, client):
#         response = await client.get("/share/invalidtoken123")
#         assert response.status_code == 404

#     async def test_follow_unknown_token(self, client):
#         response = await client.get("/share/zzzzzzz")
#         assert response.status_code == 404


# @pytest.mark.asyncio
# class TestDeleteShare:
#     async def test_delete_existing_token(self, client, activity):
#         create = await client.post(
#             "/share/",
#             json={
#                 "activity_id": activity["id"],
#                 "username": "testuser",
#             },
#         )
#         token = create.json()["token"]

#         response = await client.delete(f"/share/{token}")
#         assert response.status_code == 200
#         assert response.json()["deleted"] is True

#     async def test_delete_nonexistent_token(self, client):
#         # Doit retourner 200 même si le token n'existe pas (pop silencieux)
#         response = await client.delete("/share/doesnotexist")
#         assert response.status_code == 200
#         assert response.json()["deleted"] is True
