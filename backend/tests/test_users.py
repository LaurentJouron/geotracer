# """
# Tests — utilisateurs (CRUD, activités par user)
# """

# import pytest


# @pytest.mark.asyncio
# class TestCreateUser:
#     async def test_create_user_success(self, client):
#         response = await client.post(
#             "/users/",
#             json={
#                 "username": "velouser",
#                 "email": "velo@geographix.dev",
#                 "password": "velop@ss123",
#             },
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert data["username"] == "velouser"
#         assert data["email"] == "velo@geographix.dev"
#         assert "id" in data
#         assert "hashed_password" not in data

#     async def test_create_user_duplicate_username(self, client):
#         await client.post(
#             "/users/",
#             json={
#                 "username": "dupvelo",
#                 "email": "a@test.dev",
#                 "password": "pass123",
#             },
#         )
#         response = await client.post(
#             "/users/",
#             json={
#                 "username": "dupvelo",
#                 "email": "b@test.dev",
#                 "password": "pass123",
#             },
#         )
#         assert response.status_code == 400

#     async def test_create_user_has_created_at(self, client):
#         response = await client.post(
#             "/users/",
#             json={
#                 "username": "dateuser",
#                 "email": "date@test.dev",
#                 "password": "pass123",
#             },
#         )
#         assert response.json()["created_at"] is not None


# @pytest.mark.asyncio
# class TestGetUser:
#     async def test_get_existing_user(self, client):
#         create = await client.post(
#             "/users/",
#             json={
#                 "username": "getme",
#                 "email": "getme@test.dev",
#                 "password": "pass123",
#             },
#         )
#         user_id = create.json()["id"]
#         response = await client.get(f"/users/{user_id}")
#         assert response.status_code == 200
#         assert response.json()["id"] == user_id

#     async def test_get_nonexistent_user(self, client):
#         response = await client.get("/users/999999")
#         assert response.status_code == 404


# @pytest.mark.asyncio
# class TestUserActivities:
#     async def test_get_user_activities_empty(self, client, auth_client):
#         response = await client.get(f"/users/{auth_client.user_id}/activities")
#         assert response.status_code == 200
#         assert isinstance(response.json(), list)

#     async def test_get_user_activities_after_create(self, auth_client):
#         await auth_client.post(
#             "/activities/",
#             json={
#                 "user_id": auth_client.user_id,
#                 "title": "Sortie Cannes",
#             },
#         )
#         response = await auth_client.get(
#             f"/users/{auth_client.user_id}/activities"
#         )
#         assert response.status_code == 200
#         activities = response.json()
#         assert len(activities) >= 1
#         assert any(a["title"] == "Sortie Cannes" for a in activities)
