from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    avatar_url = Column(Text, nullable=True)  # URL ou base64
    created_at = Column(DateTime, default=datetime.utcnow)

    activities = relationship("Activity", back_populates="user")
