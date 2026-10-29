import { useEffect, useRef, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { offlineList, offlinePut, offlineDelete } from '@/lib/offlineWork';
import { downloadScope, downloadScopeTiles, removeTiles, scopeTileCount, storedTileCount, VIRGINIA_BOUNDS } from '@/lib/offlineMapTiles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const SCOPES = [
  { id: 'center', label: 'Around map center', detail: '3 km · street level' },
  { id: 'region', label: 'Around map center', detail: '25 km · city level' },
  { id: 'state', label: 'All of Virginia', detail: 'Statewide · overview' },
];

const megabytes = tiles => Math.max(1, Math.round((tiles * 22) / 1024));

export default function OfflineMapControl({ owner, offline }) {
  const map = useMap();
  const [open, setOpen] = useState(false);
  const [storedAreas, setAreas] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(null);
  const [tileTotal, setTileTotal] = useState(0);
  const abortRef = useRef(null);

  const areas = storedAreas.filter(area => area.owner === owner);
  const stateSaved = areas.some(area => area.data?.scope === 'state');
  const load = () => offlineList(owner, 'map').then(setAreas).catch(e => setMessage(e.message));

  useEffect(() => {
    load();
    storedTileCount().then(setTileTotal);
    const show = () => setOpen(true);
    window.addEventListener('bps-open-offline-maps', show);
    return () => window.removeEventListener('bps-open-offline-maps', show);
  }, [owner]);

  const shown = selected ? areas.filter(area => area.key === selected) : offline ? areas : [];

  const download = async scope => {
    if (!owner) return;
    const center = map.getCenter();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage('');
    setProgress({ done: 0, total: scopeTileCount(scope, center) });
    try {
      const result = await downloadScopeTiles({
        scope,
        center: { lat: center.lat, lng: center.lng },
        signal: controller.signal,
        onProgress: setProgress,
      });
      const title = name.trim() || (scope === 'state' ? 'All of Virginia' : `${Math.abs(center.lat).toFixed(3)}°, ${Math.abs(center.lng).toFixed(3)}°`);
      const { bounds, zooms } = downloadScope(scope, center);
      const id = crypto.randomUUID();
      await offlinePut({
        key: `${owner}:map:${id}`,
        id,
        owner,
        kind: 'map',
        title,
        updatedAt: Date.now(),
        data: { center: [center.lat, center.lng], bounds, zooms, scope, tiles: result.total, urls: result.urls },
      });
      await load();
      setSelected(`${owner}:map:${id}`);
      setName('');
      setTileTotal(await storedTileCount());
      setMessage(`${result.saved + result.skipped} street tiles saved for ${title}. ${result.failed ? `${result.failed} tile(s) could not be reached and will fill in next time you are connected.` : ''}`.trim());
    } catch (e) {
      setMessage('Not downloaded: ' + e.message);
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const remove = async area => {
    try {
      await removeTiles(area.data?.urls || []);
      await offlineDelete(area.key);
      if (selected === area.key) setSelected('');
      await load();
      setTileTotal(await storedTileCount());
    } catch (e) {
      setMessage(e.message);
    }
  };

  const percent = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      {shown.map(area => area.data?.geojson?.features?.length ? (
        <GeoJSON
          key={area.key}
          data={area.data.geojson}
          style={{ color: '#67e8f9', weight: 3, opacity: 0.9 }}
          pointToLayer={(feature, latlng) => L.circleMarker(latlng, { radius: 4, color: '#fbbf24' })}
          onEachFeature={(feature, layer) => {
            if (feature.properties?.name) {
              const label = document.createElement('span');
              label.textContent = feature.properties.name;
              layer.bindTooltip(label, { sticky: true });
            }
          }}
        />
      ) : null)}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Download offline street maps</DialogTitle>
            <DialogDescription>
              Saves the street reference map (roads and place names) to this device so it opens with no connection. Satellite imagery and offline route calculation are not included.
            </DialogDescription>
          </DialogHeader>

          {!stateSaved && !busy && (
            <div className="rounded-lg border border-amber-600 bg-amber-950/30 p-4">
              <p className="text-sm font-bold text-amber-200">Virginia is not saved on this device yet</p>
              <p className="mt-1 text-xs text-amber-100">
                Download every Virginia street tile once ({scopeTileCount('state', map.getCenter())} tiles, about {megabytes(scopeTileCount('state', map.getCenter()))} MB) and the map keeps working anywhere in the state.
              </p>
            </div>
          )}

          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-300">Name this download</span>
            <input
              aria-label="Saved map name"
              placeholder="Optional name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="min-h-11 w-full rounded border p-3"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            {SCOPES.map(scope => (
              <button
                key={scope.id}
                type="button"
                disabled={busy || !owner}
                onClick={() => download(scope.id)}
                className={`min-h-11 rounded border p-3 text-left text-xs disabled:opacity-50 ${scope.id === 'state' ? 'border-cyan-600 bg-cyan-950/30' : ''}`}
              >
                <span className="block text-sm font-bold">{scope.id === 'state' ? 'Download all of Virginia' : `Download ${scope.label}`}</span>
                <span className="block text-[11px] text-slate-400">{scope.detail}</span>
                <span className="block text-[11px] text-slate-400">
                  {scopeTileCount(scope.id, map.getCenter())} tiles · ~{megabytes(scopeTileCount(scope.id, map.getCenter()))} MB
                </span>
              </button>
            ))}
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-cyan-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p role="status" className="text-xs text-slate-300">
                Saving tiles {progress.done} of {progress.total} · {percent}%{progress.failed ? ` · ${progress.failed} unreachable` : ''}
              </p>
              <button type="button" className="min-h-11 rounded border px-3 text-xs" onClick={() => abortRef.current?.abort()}>Stop download</button>
            </div>
          )}

          {message && <p role="status" className="text-sm">{message}</p>}

          <button type="button" className="min-h-11 text-left text-xs underline" onClick={() => setSelected('')}>
            Use the live map when connected
          </button>

          <div className="space-y-2">
            {areas.map(area => (
              <div key={area.key} className="flex gap-2">
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded border p-3 text-left"
                  onClick={() => {
                    setSelected(area.key);
                    if (area.data?.center) map.setView(area.data.center, area.data.scope === 'state' ? 8 : 14);
                    setOpen(false);
                  }}
                >
                  {area.title}
                  <span className="block text-xs text-slate-400">
                    Saved {new Date(area.updatedAt).toLocaleString()} · {area.data?.tiles || 0} tiles{area.data?.scope === 'state' ? ' · statewide' : ''}
                  </span>
                </button>
                <button type="button" className="min-h-11 rounded border px-3" aria-label={'Remove downloaded map ' + area.title} disabled={busy} onClick={() => remove(area)}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs">
            {tileTotal} street tiles on this device. Virginia spans {VIRGINIA_BOUNDS.south.toFixed(2)}° to {VIRGINIA_BOUNDS.north.toFixed(2)}° N · © OpenStreetMap contributors ·{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">ODbL</a>. New routes, traffic, and satellite imagery still need a connection.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}