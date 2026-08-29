import { useEffect, useMemo, useRef, useState } from 'react';
import { TileLayer } from 'react-leaflet';

const THEME_KEY = 'bps-map-theme';

const PROVIDERS = {
  street: [
    { id: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', subdomains: 'abc' },
    { id: 'carto-voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd' },
    { id: 'esri-street', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  ],
  night: [
    { id: 'carto-dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd' },
    { id: 'osm-night', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', subdomains: 'abc', filter: true },
    { id: 'esri-night', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', filter: true },
  ],
  satellite: [
    { id: 'esri-imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
    { id: 'carto-voyager-fallback', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd' },
    { id: 'osm-fallback', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', subdomains: 'abc' },
  ],
};

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

export default function PathfinderTileLayer({ theme, satellite = false }) {
  const [globalTheme] = usePathfinderMapTheme();
  const effectiveTheme = theme || globalTheme;
  const providerGroup = satellite ? 'satellite' : effectiveTheme === 'night' ? 'night' : 'street';
  const providers = useMemo(() => PROVIDERS[providerGroup], [providerGroup]);
  const [providerIndex, setProviderIndex] = useState(0);
  const [, setTileErrors] = useState(0);
  const loadedNoticeRef = useRef(false);

  useEffect(() => {
    setProviderIndex(0);
    setTileErrors(0);
    loadedNoticeRef.current = false;
  }, [providerGroup]);

  const provider = providers[Math.min(providerIndex, providers.length - 1)];
  const handleTileError = () => {
    setTileErrors(errors => {
      const next = errors + 1;
      if (next >= 3 && providerIndex < providers.length - 1) {
        setProviderIndex(index => Math.min(index + 1, providers.length - 1));
        loadedNoticeRef.current = false;
        return 0;
      }
      if (next >= 3 && providerIndex >= providers.length - 1) {
        window.dispatchEvent(new CustomEvent('bps-map-tiles-failed', { detail: { providerGroup } }));
      }
      return next;
    });
  };

  return (
    <>
      <TileLayer
        key={`${providerGroup}-${provider.id}`}
        url={provider.url}
        attribution={provider.attribution}
        subdomains={provider.subdomains}
        maxZoom={20}
        maxNativeZoom={19}
        className={provider.filter ? 'bps-night-map-tiles' : ''}
        eventHandlers={{
          tileerror: handleTileError,
          tileload: () => {
            if (loadedNoticeRef.current) return;
            loadedNoticeRef.current = true;
            window.dispatchEvent(new CustomEvent('bps-map-tiles-loaded', { detail: { providerGroup, provider: provider.id } }));
          },
        }}
      />
      <style>{`.bps-night-map-tiles{filter:invert(1) hue-rotate(180deg) brightness(.72) contrast(1.18) saturate(.55);}`}</style>
    </>
  );
}
