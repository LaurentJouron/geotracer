"""
reset_db.py — Supprime toutes les données de la base (DEV uniquement)

Usage :
    cd backend
    pipenv run python ../scripts/reset_db.py
    pipenv run python ../scripts/reset_db.py --yes  # sans confirmation
"""

import asyncio
import sys
import argparse
from sqlalchemy import text

sys.path.insert(0, ".")
from app.database import engine


TABLES = [
    "gps_points",
    "activities",
    "users",
]

RESET_SEQUENCES = [
    "activities_id_seq",
    "users_id_seq",
]


async def reset():
    print("\n⚠️  RESET BASE DE DONNÉES — MODE DEV")
    print("─" * 40)

    async with engine.begin() as conn:
        # Désactiver les contraintes FK pendant le nettoyage
        await conn.execute(text("SET session_replication_role = replica;"))

        for table in TABLES:
            try:
                result = await conn.execute(text(f"DELETE FROM {table}"))
                print(f"  🗑  {table:<20} {result.rowcount} lignes supprimées")
            except Exception as e:
                print(f"  ⚠️  {table:<20} ignorée ({e})")

        # Réinitialiser les séquences (auto-increment repart à 1)
        for seq in RESET_SEQUENCES:
            try:
                await conn.execute(
                    text(f"ALTER SEQUENCE {seq} RESTART WITH 1")
                )
                print(f"  🔄 {seq:<20} réinitialisée")
            except Exception:
                pass

        # Réactiver les contraintes FK
        await conn.execute(text("SET session_replication_role = DEFAULT;"))

    print("\n✅ Base nettoyée — prête pour de nouveaux tests\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset base de données (DEV)")
    parser.add_argument("--yes", action="store_true", help="Sans confirmation")
    args = parser.parse_args()

    if not args.yes:
        print("\n⚠️  Cette opération supprime TOUTES les données.")
        confirm = input("   Confirmer ? (oui/non) : ").strip().lower()
        if confirm not in ("oui", "o", "yes", "y"):
            print("   Annulé.\n")
            sys.exit(0)

    asyncio.run(reset())
