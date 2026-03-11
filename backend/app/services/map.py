"""
Service de génération de cartes Folium.
Produit des cartes HTML interactives du tracé vélo.
"""
import folium
from folium import plugins
from typing import List, Dict, Optional
import json


def generate_activity_map(
    points: List[Dict],
    title: str = "Sortie vélo",
    stats: Optional[Dict] = None,
) -> str:
    """
    Génère une carte HTML interactive Folium pour une sortie.

    Args:
        points: liste de {lat, lon, alt, speed_kmh, ts}
        title: titre de la sortie
        stats: statistiques calculées (optionnel)

    Returns:
        HTML string de la carte
    """
    if not points:
        return "<p>Aucun point GPS disponible.</p>"

    coords = [(p["lat"], p["lon"]) for p in points]
    center_lat = sum(p["lat"] for p in points) / len(points)
    center_lon = sum(p["lon"] for p in points) / len(points)

    # Carte de base
    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=13,
        tiles="CartoDB.DarkMatter",  # Style sombre élégant
    )

    # --- Tracé coloré par vitesse ---
    max_speed = max((p.get("speed_kmh", 0) or 0 for p in points), default=1)

    for i in range(len(coords) - 1):
        speed = points[i].get("speed_kmh", 0) or 0
        color = _speed_to_color(speed, max_speed)
        folium.PolyLine(
            [coords[i], coords[i + 1]],
            color=color,
            weight=4,
            opacity=0.85,
        ).add_to(m)

    # --- Marqueur départ ---
    folium.Marker(
        location=coords[0],
        popup=folium.Popup("🚀 Départ", max_width=150),
        icon=folium.Icon(color="green", icon="play", prefix="fa"),
    ).add_to(m)

    # --- Marqueur arrivée ---
    folium.Marker(
        location=coords[-1],
        popup=folium.Popup("🏁 Arrivée", max_width=150),
        icon=folium.Icon(color="red", icon="flag", prefix="fa"),
    ).add_to(m)

    # --- Points de vitesse max ---
    max_speed_point = max(points, key=lambda p: p.get("speed_kmh", 0) or 0)
    folium.CircleMarker(
        location=[max_speed_point["lat"], max_speed_point["lon"]],
        radius=8,
        color="#FF6B35",
        fill=True,
        fill_color="#FF6B35",
        fill_opacity=0.9,
        popup=folium.Popup(
            f"⚡ Vitesse max : {max_speed_point.get('speed_kmh', 0):.1f} km/h",
            max_width=200,
        ),
    ).add_to(m)

    # --- Minimap ---
    plugins.MiniMap(toggle_display=True).add_to(m)

    # --- Plugin fullscreen ---
    plugins.Fullscreen().add_to(m)

    # --- Mesure de distance ---
    plugins.MeasureControl(position="topleft").add_to(m)

    # --- Légende vitesse ---
    legend_html = _make_speed_legend(max_speed)
    m.get_root().html.add_child(folium.Element(legend_html))

    # --- Stats en overlay ---
    if stats:
        stats_html = _make_stats_overlay(stats, title)
        m.get_root().html.add_child(folium.Element(stats_html))

    return m._repr_html_()


def generate_live_map(points: List[Dict], activity_id: int) -> str:
    """
    Carte pour le suivi temps réel. S'auto-rafraîchit via JS.
    """
    base_map = generate_activity_map(points, title="Sortie en cours 🔴")

    # Injection d'un script de rafraîchissement automatique
    refresh_script = f"""
    <script>
    // Auto-refresh toutes les 10 secondes pour les sorties live
    setTimeout(function() {{
        fetch('/activities/{activity_id}/map')
            .then(r => r.text())
            .then(html => {{
                document.open();
                document.write(html);
                document.close();
            }});
    }}, 10000);
    </script>
    """
    return base_map.replace("</body>", refresh_script + "</body>")


def _speed_to_color(speed: float, max_speed: float) -> str:
    """Dégradé de couleur : bleu (lent) → vert → jaune → rouge (rapide)."""
    if max_speed == 0:
        return "#3388ff"
    ratio = min(speed / max_speed, 1.0)
    if ratio < 0.33:
        # Bleu → Vert
        r = int(0 + ratio * 3 * 100)
        return f"#{r:02x}cc{int(255 - ratio * 3 * 100):02x}"
    elif ratio < 0.66:
        # Vert → Jaune
        r = int((ratio - 0.33) * 3 * 255)
        return f"#{r:02x}cc00"
    else:
        # Jaune → Rouge
        g = int(255 - (ratio - 0.66) * 3 * 255)
        return f"#ff{g:02x}00"


def _make_speed_legend(max_speed: float) -> str:
    return f"""
    <div style="
        position: fixed; bottom: 30px; right: 10px; z-index: 1000;
        background: rgba(20,20,30,0.85); border-radius: 8px;
        padding: 10px 14px; color: white; font-family: monospace;
        font-size: 12px; border: 1px solid rgba(255,255,255,0.1);
    ">
        <b>Vitesse (km/h)</b><br>
        <span style="color:#3388ff">■</span> Lent (0)<br>
        <span style="color:#00cc88">■</span> Modéré<br>
        <span style="color:#ffcc00">■</span> Rapide<br>
        <span style="color:#ff4400">■</span> Max ({max_speed:.0f})<br>
    </div>
    """


def _make_stats_overlay(stats: Dict, title: str) -> str:
    duration = stats.get("duration_seconds", 0)
    h, m = divmod(duration // 60, 60)
    duration_str = f"{h}h{m:02d}" if h else f"{m}min"

    return f"""
    <div style="
        position: fixed; top: 10px; left: 50px; z-index: 1000;
        background: rgba(20,20,30,0.9); border-radius: 10px;
        padding: 12px 18px; color: white; font-family: 'Segoe UI', sans-serif;
        border: 1px solid rgba(255,165,0,0.3); min-width: 280px;
    ">
        <div style="font-size:16px; font-weight:bold; color:#FF6B35; margin-bottom:8px">
            🚴 {title}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:13px">
            <div>📏 <b>{stats.get('distance_km', 0):.1f} km</b></div>
            <div>⏱ <b>{duration_str}</b></div>
            <div>⚡ moy. <b>{stats.get('avg_speed_kmh', 0):.1f} km/h</b></div>
            <div>🚀 max <b>{stats.get('max_speed_kmh', 0):.1f} km/h</b></div>
            <div>⬆️ <b>+{stats.get('elevation_gain_m', 0):.0f} m</b></div>
            <div>⬇️ <b>-{stats.get('elevation_loss_m', 0):.0f} m</b></div>
        </div>
    </div>
    """
