import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, WifiOff, CheckCircle2, X, Loader2, Trash2, Map } from 'lucide-react';
import { toast } from 'sonner';

// Richmond VA region tile bounds at zoom levels 10-15
const REGIONS = [
    {
        id: 'richmond-core',
        name: 'Richmond Core',
        description: 'Downtown, Fan District, Church Hill',
        bounds: { minLat: 37.50, maxLat: 37.58, minLng: -77.50, maxLng: -77.38 },
        zoomLevels: [10, 11, 12, 13, 14],
        estimatedTiles: 180
    },
    {
        id: 'henrico-county',
        name: 'Henrico County',
        description: 'West End, Lakeside, Short Pump area',
        bounds: { minLat: 37.52, maxLat: 37.68, minLng: -77.65, maxLng: -77.38 },
        zoomLevels: [10, 11, 12, 13],
        estimatedTiles: 240
    },
    {
        id: 'chesterfield-county',
        name: 'Chesterfield County',
        description: 'Midlothian, Chester, Colonial Heights',
        bounds: { minLat: 37.30, maxLat: 37.52, minLng: -77.65, maxLng: -77.30 },
        zoomLevels: [10, 11, 12, 13],
        estimatedTiles: 260
    }
];

const CACHE_NAME = 'bps-map-tiles-v1';

async function isTileCached(url) {
    if (!('caches' in window)) return false;
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    return !!match;
}

async function cacheTile(url) {
    if (!('caches' in window)) return;
    try {
        const cache = await caches.open(CACHE_NAME);
        const existing = await cache.match(url);
        if (existing) return;
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) {
            await cache.put(url, response.clone());
        }
    } catch (e) {
        // Tile fetch failed — skip silently
    }
}

function getTileUrl(z, x, y) {
    // Round-robin across subdomains
    const sub = ['a', 'b', 'c'][Math.abs(x + y) % 3];
    return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

function getTilesForRegion(region) {
    const tiles = [];
    for (const z of region.zoomLevels) {
        const n = Math.pow(2, z);
        const toTileX = (lng) => Math.floor(((lng + 180) / 360) * n);
        const toTileY = (lat) => {
            const r = lat * Math.PI / 180;
            return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
        };
        const xMin = toTileX(region.bounds.minLng);
        const xMax = toTileX(region.bounds.maxLng);
        const yMin = toTileY(region.bounds.maxLat);
        const yMax = toTileY(region.bounds.minLat);
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                tiles.push({ z, x, y });
            }
        }
    }
    return tiles;
}

async function getRegionCacheStatus(region) {
    if (!('caches' in window)) return { cached: 0, total: region.estimatedTiles };
    const tiles = getTilesForRegion(region);
    let cached = 0;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const cachedUrls = new Set(keys.map(k => k.url));
    for (const t of tiles) {
        if (cachedUrls.has(getTileUrl(t.z, t.x, t.y))) cached++;
    }
    return { cached, total: tiles.length };
}

async function deleteRegionCache(region) {
    if (!('caches' in window)) return;
    const tiles = getTilesForRegion(region);
    const cache = await caches.open(CACHE_NAME);
    for (const t of tiles) {
        await cache.delete(getTileUrl(t.z, t.x, t.y));
    }
}

export default function OfflineMapManager({ isOpen, onClose, isOnline }) {
    const [regionStatus, setRegionStatus] = useState({});
    const [downloading, setDownloading] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(0);

    useEffect(() => {
        if (isOpen) loadStatus();
    }, [isOpen]);

    const loadStatus = async () => {
        const status = {};
        for (const region of REGIONS) {
            status[region.id] = await getRegionCacheStatus(region);
        }
        setRegionStatus(status);
    };

    const handleDownload = async (region) => {
        if (!isOnline) {
            toast.error('Cannot download — you are offline');
            return;
        }
        setDownloading(region.id);
        setDownloadProgress(0);
        const tiles = getTilesForRegion(region);
        let done = 0;
        // Download in small batches to avoid overwhelming the browser
        const BATCH = 5;
        for (let i = 0; i < tiles.length; i += BATCH) {
            const batch = tiles.slice(i, i + BATCH);
            await Promise.all(batch.map(t => cacheTile(getTileUrl(t.z, t.x, t.y))));
            done += batch.length;
            setDownloadProgress(Math.round((done / tiles.length) * 100));
        }
        setDownloading(null);
        toast.success(`${region.name} cached for offline use`);
        await loadStatus();
    };

    const handleDelete = async (region) => {
        await deleteRegionCache(region);
        toast.success(`${region.name} removed from cache`);
        await loadStatus();
    };

    const supportsCache = 'caches' in window;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black z-[3000]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-0 left-0 right-0 z-[3001] bg-slate-900 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <WifiOff className="w-5 h-5 text-amber-400" />
                                <h2 className="text-white font-bold text-lg font-mono">OFFLINE MAP CACHE</h2>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {!supportsCache && (
                            <div className="bg-red-900/40 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-sm">
                                Your browser does not support offline caching. Use a modern browser for this feature.
                            </div>
                        )}

                        <p className="text-slate-400 text-sm mb-4">
                            Download map regions to use when internet is unavailable. GPS tracking will continue via device GPS.
                        </p>

                        <div className="space-y-3">
                            {REGIONS.map(region => {
                                const status = regionStatus[region.id];
                                const isFullyCached = status && status.cached >= status.total * 0.9;
                                const isDownloadingThis = downloading === region.id;
                                const hasSomeCache = status && status.cached > 0;

                                return (
                                    <div key={region.id} className="bg-slate-800 rounded-xl p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Map className="w-4 h-4 text-blue-400" />
                                                    <span className="text-white font-semibold text-sm">{region.name}</span>
                                                    {isFullyCached && (
                                                        <Badge className="bg-green-600/30 text-green-400 text-[10px]">CACHED</Badge>
                                                    )}
                                                    {hasSomeCache && !isFullyCached && (
                                                        <Badge className="bg-amber-600/30 text-amber-400 text-[10px]">PARTIAL</Badge>
                                                    )}
                                                </div>
                                                <p className="text-slate-400 text-xs mt-0.5">{region.description}</p>
                                                {status && (
                                                    <p className="text-slate-500 text-[11px] mt-1">
                                                        {status.cached} / {status.total} tiles cached
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                {hasSomeCache && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDelete(region)}
                                                        className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                                                        disabled={!!downloading}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleDownload(region)}
                                                    disabled={!!downloading || !isOnline}
                                                    className={`text-xs h-8 ${isFullyCached ? 'bg-green-700 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                >
                                                    {isDownloadingThis ? (
                                                        <><Loader2 className="w-3 h-3 animate-spin mr-1" />{downloadProgress}%</>
                                                    ) : isFullyCached ? (
                                                        <><CheckCircle2 className="w-3 h-3 mr-1" />Update</>
                                                    ) : (
                                                        <><Download className="w-3 h-3 mr-1" />Cache</>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>

                                        {isDownloadingThis && (
                                            <div className="mt-2">
                                                <div className="w-full bg-slate-700 rounded-full h-1.5">
                                                    <motion.div
                                                        className="bg-blue-500 h-1.5 rounded-full"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${downloadProgress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-slate-500 text-xs">
                                <strong className="text-slate-400">Note:</strong> Cached tiles allow map viewing without internet. 
                                Location tracking uses device GPS and works offline. Route calculation requires internet.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}