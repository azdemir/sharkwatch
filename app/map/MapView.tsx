import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Default Leaflet marker images are not bundled by Next, so use a plain
// circle marker icon drawn inline instead of the missing-image default.
const pin = L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: `<div style="width:18px;height:18px;border-radius:50%;background:#ffb454;border:2px solid #04090f;box-shadow:0 0 0 3px rgba(255,180,84,.35)"></div>` });

type Clip = { id: string; title: string; scene?: { beachName?: string; center?: { lat: number; lon: number } } | null };

export default function MapView({ clips }: { clips: Clip[] }) {
  const center: [number, number] = clips[0]?.scene?.center ? [clips[0].scene.center.lat, clips[0].scene.center.lon] : [0, 0];
  return (
    <MapContainer center={center} zoom={2} maxZoom={19} attributionControl={false} style={{ height: "100%", width: "100%", background: "#000812" }} scrollWheelZoom>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles © Esri" maxZoom={19} />
      {clips.map((c) => c.scene?.center ? (
        <Marker key={c.id} position={[c.scene.center.lat, c.scene.center.lon]} icon={pin}>
          <Tooltip direction="top" offset={[0, -10]}>{c.scene.beachName ?? c.title}<br />{c.title}</Tooltip>
        </Marker>
      ) : null)}
    </MapContainer>
  );
}
