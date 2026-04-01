from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class ShareToken(Base):
    """Token de partage pour suivre une sortie ou un utilisateur en temps réel."""

    __tablename__ = "share_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # activity_id = None → partage toutes les sorties live de l'utilisateur
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=True)
    label = Column(String(200), nullable=True)  # ex: "Tour de Corse 2026"
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    activity = relationship("Activity")
