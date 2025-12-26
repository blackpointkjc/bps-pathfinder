import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { 
    Download, 
    MapPin, 
    Trash2, 
    HardDrive,
    AlertCircle,
    CheckCircle2,
    Loader2
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

export default function OfflineMapManager({ currentLocation, onClose }) {
    const [regions, setRegions] = useState([]);
    const [downloading, setDownloading] = useState(null);
    const [progress, setProgress] = useState(0);
    const [regionName, setRegionName] = useState('');
    const [storageUsed, setStorageUsed] = useState(0);

    useEffect(() => {
        loadRegions();
        calculateStorage();
    }, []);

    const loadRegions = async () => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['regions'], 'readonly');
            const store = transaction.objectStore('regions');
            const request = store.getAll();
            
            request.onsuccess = () => {
                setRegions(request.result || []);
            };
        } catch (error) {
            console.error('Error loading regions:', error);
        }
    };

    const calculateStorage = async () => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['tiles'], 'readonly');
            const store = transaction.objectStore('tiles');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const tiles = request.result || [];
                const totalSize = tiles.reduce((sum, tile) => sum + (tile.size || 0), 0);
                setStorageUsed((totalSize / (1024 * 1024)).toFixed(1)); // Convert to MB
            };
        } catch (error) {
            console.error('Error calculating storage:', error);
        }
    };

    const openDatabase = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('OfflineMaps', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tiles')) {
                    db.createObjectStore('tiles', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('regions')) {
                    db.createObjectStore('regions', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    };

    const downloadRegion = async () => {
        if (!currentLocation) {
            toast.error('Current location not available');
            return;
        }

        if (!regionName.trim()) {
            toast.error('Please enter a region name');
            return;
        }

        setDownloading(true);
        setProgress(0);

        try {
            const zoomLevels = [11, 12, 13, 14]; // Zoom levels to download
            const radius = 0.05; // ~5km radius
            const lat = currentLocation[0];
            const lon = currentLocation[1];

            const tiles = [];
            let totalTiles = 0;
            let downloadedTiles = 0;

            // Calculate total tiles
            zoomLevels.forEach(zoom => {
                const tilesPerSide = Math.pow(2, zoom);
                const latTile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * tilesPerSide);
                const lonTile = Math.floor((lon + 180) / 360 * tilesPerSide);
                
                for (let x = lonTile - 2; x <= lonTile + 2; x++) {
                    for (let y = latTile - 2; y <= latTile + 2; y++) {
                        if (x >= 0 && x < tilesPerSide && y >= 0 && y < tilesPerSide) {
                            totalTiles++;
                        }
                    }
                }
            });

            const db = await openDatabase();

            // Download tiles
            for (const zoom of zoomLevels) {
                const tilesPerSide = Math.pow(2, zoom);
                const latTile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * tilesPerSide);
                const lonTile = Math.floor((lon + 180) / 360 * tilesPerSide);
                
                for (let x = lonTile - 2; x <= lonTile + 2; x++) {
                    for (let y = latTile - 2; y <= latTile + 2; y++) {
                        if (x >= 0 && x < tilesPerSide && y >= 0 && y < tilesPerSide) {
                            try {
                                const tileUrl = `https://a.basemaps.cartocdn.com/light_all/${zoom}/${x}/${y}.png`;
                                const response = await fetch(tileUrl);
                                const blob = await response.blob();
                                
                                const transaction = db.transaction(['tiles'], 'readwrite');
                                const store = transaction.objectStore('tiles');
                                
                                await new Promise((resolve, reject) => {
                                    const request = store.put({
                                        key: `${zoom}/${x}/${y}`,
                                        blob: blob,
                                        size: blob.size,
                                        timestamp: Date.now()
                                    });
                                    request.onsuccess = resolve;
                                    request.onerror = reject;
                                });

                                downloadedTiles++;
                                setProgress(Math.round((downloadedTiles / totalTiles) * 100));
                                
                                // Small delay to prevent overwhelming the server
                                await new Promise(resolve => setTimeout(resolve, 50));
                            } catch (error) {
                                console.error('Error downloading tile:', error);
                            }
                        }
                    }
                }
            }

            // Save region info
            const transaction = db.transaction(['regions'], 'readwrite');
            const store = transaction.objectStore('regions');
            
            await new Promise((resolve, reject) => {
                const request = store.add({
                    name: regionName,
                    center: currentLocation,
                    downloadDate: new Date().toISOString(),
                    tileCount: downloadedTiles,
                    zoomLevels: zoomLevels
                });
                request.onsuccess = resolve;
                request.onerror = reject;
            });

            toast.success(`Downloaded ${downloadedTiles} tiles for ${regionName}`);
            setRegionName('');
            loadRegions();
            calculateStorage();
        } catch (error) {
            console.error('Error downloading region:', error);
            toast.error('Failed to download region');
        } finally {
            setDownloading(false);
            setProgress(0);
        }
    };

    const deleteRegion = async (regionId) => {
        try {
            const db = await openDatabase();
            const transaction = db.transaction(['regions'], 'readwrite');
            const store = transaction.objectStore('regions');
            
            await new Promise((resolve, reject) => {
                const request = store.delete(regionId);
                request.onsuccess = resolve;
                request.onerror = reject;
            });

            toast.success('Region deleted');
            loadRegions();
            calculateStorage();
        } catch (error) {
            console.error('Error deleting region:', error);
            toast.error('Failed to delete region');
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed top-0 right-0 h-full w-full md:w-[420px] z-[2000] bg-white shadow-2xl"
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-2xl font-bold text-[#1D1D1F]">Offline Maps</h2>
                            <Button variant="ghost" size="icon" onClick={onClose}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <HardDrive className="w-4 h-4" />
                            <span>{storageUsed} MB used</span>
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        {/* Download New Region */}
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="font-semibold text-[#1D1D1F] mb-3">Download Region</h3>
                            <div className="space-y-3">
                                <Input
                                    placeholder="Enter region name..."
                                    value={regionName}
                                    onChange={(e) => setRegionName(e.target.value)}
                                    disabled={downloading}
                                />
                                <Button
                                    onClick={downloadRegion}
                                    disabled={downloading || !currentLocation || !regionName.trim()}
                                    className="w-full bg-[#007AFF] hover:bg-[#0056CC]"
                                >
                                    {downloading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Downloading... {progress}%
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4 mr-2" />
                                            Download Current Area
                                        </>
                                    )}
                                </Button>
                                {downloading && (
                                    <Progress value={progress} className="h-2" />
                                )}
                                {!currentLocation && (
                                    <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        <span>Enable location to download current area</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Downloaded Regions */}
                        <div className="p-6">
                            <h3 className="font-semibold text-[#1D1D1F] mb-3">Downloaded Regions</h3>
                            {regions.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                    <p>No offline maps downloaded</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {regions.map((region) => (
                                        <Card key={region.id} className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <MapPin className="w-4 h-4 text-[#007AFF]" />
                                                        <h4 className="font-semibold text-[#1D1D1F]">{region.name}</h4>
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        Downloaded: {new Date(region.downloadDate).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {region.tileCount} tiles
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => deleteRegion(region.id)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}