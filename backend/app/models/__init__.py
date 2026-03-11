# Importer tous les modèles ici pour que SQLAlchemy les enregistre
# et que init_db() crée toutes les tables au démarrage.
from app.models.user import User
from app.models.activity import Activity, GpsPoint
from app.models.share_token import ShareToken
