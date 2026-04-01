# """
# Tests — encouragements (cheers)
# """

# import pytest


# @pytest.mark.asyncio
# class TestSendCheer:
#     async def test_send_cheer_success(self, client, activity):
#         response = await client.post(
#             f"/activities/{activity['id']}/cheers",
#             json={"author_name": "Marie", "message": "Allez Laurent ! 💪"},
#         )
#         assert response.status_code == 200
#         data = response.json()
#         assert data["author_name"] == "Marie"
#         assert data["message"] == "Allez Laurent ! 💪"
#         assert data["activity_id"] == activity["id"]
#         assert data["parent_id"] is None

#     async def test_send_cheer_with_reply(self, client, activity):
#         # Envoyer un premier cheer
#         first = await client.post(
#             f"/activities/{activity['id']}/cheers",
#             json={"author_name": "Pierre", "message": "Courage !"},
#         )
#         first_id = first.json()["id"]

#         # Répondre à ce cheer
#         response = await client.post(
#             f"/activities/{activity['id']}/cheers",
#             json={
#                 "author_name": "Sophie",
#                 "message": "Je confirme !",
#                 "parent_id": first_id,
#             },
#         )
#         assert response.status_code == 200
#         assert response.json()["parent_id"] == first_id

#     async def test_send_cheer_nonexistent_activity(self, client):
#         response = await client.post(
#             "/activities/999999/cheers",
#             json={"author_name": "Test", "message": "Hello"},
#         )
#         assert response.status_code == 404

#     async def test_send_cheer_truncates_long_name(self, client, activity):
#         long_name = "A" * 200
#         response = await client.post(
#             f"/activities/{activity['id']}/cheers",
#             json={"author_name": long_name, "message": "Test"},
#         )
#         assert response.status_code == 200
#         assert len(response.json()["author_name"]) <= 100


# @pytest.mark.asyncio
# class TestGetCheers:
#     async def test_get_cheers_empty(self, client, activity):
#         response = await client.get(f"/activities/{activity['id']}/cheers")
#         assert response.status_code == 200
#         assert isinstance(response.json(), list)

#     async def test_get_cheers_ordered(self, client, activity):
#         for i in range(3):
#             await client.post(
#                 f"/activities/{activity['id']}/cheers",
#                 json={"author_name": f"User{i}", "message": f"Message {i}"},
#             )
#         response = await client.get(f"/activities/{activity['id']}/cheers")
#         cheers = response.json()
#         assert len(cheers) >= 3
#         # Vérifier l'ordre chronologique
#         for i in range(1, len(cheers)):
#             assert cheers[i]["sent_at"] >= cheers[i - 1]["sent_at"]


# @pytest.mark.asyncio
# class TestUpdateDeleteCheer:
#     async def test_update_cheer(self, client, activity):
#         cheer = await client.post(
#             f"/activities/{activity['id']}/cheers",
#             json={"author_name": "Test", "message": "Original"},
#         )
#         cheer_id = cheer.json()["id"]

#         response = await client.patch(
#             f"/activities/cheers/{cheer_id}", json={"message": "Modifié"}
#         )
#         assert response.status_code == 200

#     async def test_delete_cheer(self, client, activity):
#         cheer = await client.post(
#             f"/activities/{activity['id']}/cheers",
#             json={"author_name": "ToDelete", "message": "Bye"},
#         )
#         cheer_id = cheer.json()["id"]

#         response = await client.delete(f"/activities/cheers/{cheer_id}")
#         assert response.status_code == 200
#         assert response.json()["status"] == "deleted"

#     async def test_delete_nonexistent_cheer(self, client):
#         response = await client.delete("/activities/cheers/999999")
#         assert response.status_code == 404
