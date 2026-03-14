from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.database import Base


class Activity(Base):
    """Une sortie vélo."""
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), default="Sortie vélo")

    # Dates
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)

    # Stats calculées à la fin
    distance_km = Column(Float, nullable=True)       # km
    duration_seconds = Column(Integer, nullable=True) # secondes
    avg_speed_kmh = Column(Float, nullable=True)      # km/h
    max_speed_kmh = Column(Float, nullable=True)      # km/h
    elevation_gain_m = Column(Float, nullable=True)   # mètres de dénivelé +
    elevation_loss_m = Column(Float, nullable=True)   # mètres de dénivelé -

    # Tracé GPS stocké en PostGIS (LineString WGS84)
    # Chaque point = (longitude, latitude, altitude, timestamp)
    track = Column(Geometry("LINESTRINGZM", srid=4326), nullable=True)

    # Statut
    is_live = Column(Integer, default=1)  # 1 = en cours, 0 = terminée

    # Données brutes JSON (points GPS avec timestamps)
    raw_points = Column(Text, nullable=True)  # JSON list of {lat, lon, alt, speed, ts}

    # Relations
    user   = relationship("User", back_populates="activities")
    cheers = relationship("Cheer", back_populates="activity", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Activity {self.id} - {self.title}>"


class GpsPoint(Base):
    """Point GPS individuel pour le suivi temps réel."""
    __tablename__ = "gps_points"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    heart_rate = Column(Integer, nullable=True)  # bpm (si capteur)

    # Point PostGIS
    location = Column(Geometry("POINT", srid=4326), nullable=True)
