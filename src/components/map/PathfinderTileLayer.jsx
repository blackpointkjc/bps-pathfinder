import { useEffect, useState } from 'react';
import { TileLayer } from 'react-leaflet';

const THEME_KEY = 'bps-map-theme';

export function getDefaultMapTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'day' || saved === 'night') return saved;
  } catch {}
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6 ? 'night' : 'day';
}

export function usePathfinderMapTheme() {
  const [theme, setThemeState] = useState(getDefaultMapTheme);
  useEffect(() => {
    const sync = event => setThemeState(event?.detail?.theme || getDefaultMapTheme());
    window.addEventListener('bps-map-theme-changed', sync);
    return () => window.removeEventListener('bps-map-theme-changed', sync);
  }, []);
  const setTheme = next => {
    const themeValue = next === 'night' ? 'night' : 'day';
    try { localStorage.setItem(THEME_KEY, themeValue); } catch {}
    setThemeState(themeValue);
    window.dispatchEvent(new CustomEvent('bps-map-theme-changed', { detail: { theme: themeValue } }));
  };
  return [theme, setTheme];
}

export function MapThemeToggle({ theme, onChange, className = '' }) {
  const next = theme === 'night' ? 'day' : 'night';
  return (
    <button type="button" onClick={() => onChange(next)} className={`rounded-lg border border-slate-600 bg-[#07101c]/90 px-3 py-1.5 text-[10px] font-black text-slate-200 hover:border-cyan-400 hover:text-white ${className}`}>
      {theme === 'night' ? '☀ DAY MAP' : '☾ NIGHT MAP'}
    </button>
  );
}

export default function PathfinderTileLayer({ theme = 'day', satellite = false }) {
  const night = theme === 'night';
  const url = satellite
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = satellite ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors';
  return (
    <>
      <TileLayer
        key={`${satellite ? 'satellite' : 'street'}-${theme}`}
        url={url}
        attribution={attribution}
        maxZoom={20}
        maxNativeZoom={20}
        className={night ? 'bps-night-map-tiles' : ''}
      />
      {night && <style>{`.bps-night-map-tiles{filter:invert(1) hue-rotate(180deg) brightness(.72) contrast(1.18) saturate(.55);}`}</style>}
    </>
  );
}
