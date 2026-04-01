# """
# Tests — authentification (register, login, me, update, avatar)
# """

# import pytest


# @pytest.mark.asyncio
# class TestRegister:
#     async def test_register_success(self, client):
#         response = await client.post(
#             "/auth/register",
#             json={
#                 "username": "newuser",
#                 "email": "newuser@test.dev",
#                 "password": "securepass123",
#             },
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert "access_token" in data
#         assert data["username"] == "newuser"
#         assert data["token_type"] == "bearer"

#     async def test_register_duplicate_username(self, client):
#         payload = {
#             "username": "dupuser",
#             "email": "dup@test.dev",
#             "password": "pass123",
#         }
#         await client.post("/auth/register", json=payload)
#         response = await client.post(
#             "/auth/register", json={**payload, "email": "other@test.dev"}
#         )
#         assert response.status_code == 400
#         assert "déjà pris" in response.json()["detail"]

#     async def test_register_duplicate_email(self, client):
#         await client.post(
#             "/auth/register",
#             json={
#                 "username": "user_a",
#                 "email": "shared@test.dev",
#                 "password": "pass123",
#             },
#         )
#         response = await client.post(
#             "/auth/register",
#             json={
#                 "username": "user_b",
#                 "email": "shared@test.dev",
#                 "password": "pass123",
#             },
#         )
#         assert response.status_code == 400
#         assert "email" in response.json()["detail"].lower()

#     async def test_register_returns_avatar_url_none(self, client):
#         response = await client.post(
#             "/auth/register",
#             json={
#                 "username": "avatartest",
#                 "email": "avatar@test.dev",
#                 "password": "pass123",
#             },
#         )
#         assert response.json()["avatar_url"] is None


# @pytest.mark.asyncio
# class TestLogin:
#     async def test_login_success(self, client):
#         await client.post(
#             "/auth/register",
#             json={
#                 "username": "loginuser",
#                 "email": "login@test.dev",
#                 "password": "mypassword",
#             },
#         )
#         response = await client.post(
#             "/auth/login",
#             data={"username": "loginuser", "password": "mypassword"},
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert "access_token" in data
#         assert data["username"] == "loginuser"

#     async def test_login_wrong_password(self, client):
#         await client.post(
#             "/auth/register",
#             json={
#                 "username": "loginuser2",
#                 "email": "login2@test.dev",
#                 "password": "correct",
#             },
#         )
#         response = await client.post(
#             "/auth/login", data={"username": "loginuser2", "password": "wrong"}
#         )
#         assert response.status_code == 401

#     async def test_login_unknown_user(self, client):
#         response = await client.post(
#             "/auth/login", data={"username": "nobody", "password": "whatever"}
#         )
#         assert response.status_code == 401


# @pytest.mark.asyncio
# class TestMe:
#     async def test_me_authenticated(self, auth_client):
#         response = await auth_client.get("/auth/me")
#         assert response.status_code == 200
#         data = response.json()
#         assert data["username"] == "testuser"
#         assert data["email"] == "test@geographix.dev"
#         assert "id" in data

#     async def test_me_unauthenticated(self, client):
#         response = await client.get("/auth/me")
#         assert response.status_code == 401

#     async def test_me_invalid_token(self, client):
#         client.headers.update({"Authorization": "Bearer invalidtoken"})
#         response = await client.get("/auth/me")
#         assert response.status_code == 401
#         client.headers.pop("Authorization", None)


# @pytest.mark.asyncio
# class TestUpdateMe:
#     async def test_update_password_too_short(self, auth_client):
#         response = await auth_client.patch(
#             "/auth/me", params={"password": "short"}
#         )
#         assert response.status_code == 400

#     async def test_update_password_success(self, auth_client):
#         response = await auth_client.patch(
#             "/auth/me", params={"password": "newpassword123"}
#         )
#         assert response.status_code == 200
#         assert response.json()["ok"] is True

#     async def test_update_unauthenticated(self, client):
#         response = await client.patch(
#             "/auth/me", params={"username": "hacker"}
#         )
#         assert response.status_code == 401


# @pytest.mark.asyncio
# class TestAvatar:
#     async def test_delete_avatar_authenticated(self, auth_client):
#         response = await auth_client.delete("/auth/me/avatar")
#         assert response.status_code == 200
#         assert response.json()["ok"] is True

#     async def test_delete_avatar_unauthenticated(self, client):
#         response = await client.delete("/auth/me/avatar")
#         assert response.status_code == 401
