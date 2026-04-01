from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship, backref
from ..database import Base


class Cheer(Base):
    __tablename__ = "cheers"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(
        Integer,
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nouveau : ID du message auquel on répond
    parent_id = Column(
        Integer, ForeignKey("cheers.id", ondelete="CASCADE"), nullable=True
    )
    author_name = Column(String(100), nullable=False)
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow)

    activity = relationship("Activity", back_populates="cheers")
    # Relation pour récupérer les réponses
    replies = relationship(
        "Cheer",
        backref=backref("parent", remote_side=[id]),
        cascade="all, delete",
    )
