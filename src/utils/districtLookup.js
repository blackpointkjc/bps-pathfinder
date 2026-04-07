/**
 * Point-in-polygon district lookup using the same GeoJSON sources as the map.
 * Caches datasets in memory to avoid repeated fetches.
 */

const cache = {};

async function fetchGeoJSON(url) {
    if (cache[url]) return cache[url];
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data?.features?.length > 0) cache[url] = data;
        return data;
    } catch {
        return null;
    }
}

// Ray casting algorithm - returns true if [lng, lat] is inside the polygon ring
function pointInRing(point, ring) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInGeometry(point, geometry) {
    if (!geometry) return false;
    if (geometry.type === 'Polygon') {
        return pointInRing(point, geometry.coordinates[0]);
    }
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some(poly => pointInRing(point, poly[0]));
    }
    return false;
}

function findFeatureForPoint(geojson, lng, lat) {
    if (!geojson?.features) return null;
    return geojson.features.find(f => pointInGeometry([lng, lat], f.geometry)) || null;
}

const SOURCES = [
    {
        url: 'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/Police_Beats/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson',
        label: (attrs) => {
            const name = attrs.Name || attrs.NAME;
            return name ? `Richmond Beat ${name}` : null;
        }
    },
    {
        url: 'https://portal.henrico.gov/mapping/rest/services/Layers/Magisterial_Districts_2021/MapServer/0/query?outFields=*&where=1%3D1&f=geojson',
        label: (attrs) => {
            const name = attrs.MAG_DIST_NAME || attrs.NAME || attrs.DISTRICT;
            return name ? `Henrico — ${name}` : null;
        }
    },
    {
        url: 'https://services3.arcgis.com/TsynfzBSE6sXfoLq/ArcGIS/rest/services/Administrative_ProdA/FeatureServer/9/query?outFields=*&where=1%3D1&f=geojson',
        label: (attrs) => {
            const name = attrs.MAG_DIST || attrs.DISTRICT || attrs.NAME || attrs.District ||
                Object.values(attrs).find(v => typeof v === 'string' && v.length > 1 && v.length < 40 && isNaN(v));
            return name ? `Chesterfield — ${name}` : null;
        }
    },
    {
        url: 'https://services2.arcgis.com/sKZWgJlU6SekCzQV/arcgis/rest/services/Magisterial_Districts/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson',
        label: (attrs) => {
            const name = attrs.MagDistName || attrs.NAME || attrs.DISTRICT;
            return name ? `Hanover — ${name}` : null;
        }
    },
];

export async function lookupDistrict(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return '—';
    if (typeof lat !== 'number' || typeof lng !== 'number') return '—';

    const datasets = await Promise.allSettled(SOURCES.map(s => fetchGeoJSON(s.url)));

    for (let i = 0; i < SOURCES.length; i++) {
        if (datasets[i].status !== 'fulfilled' || !datasets[i].value) continue;
        const feature = findFeatureForPoint(datasets[i].value, lng, lat);
        if (feature) {
            const label = SOURCES[i].label(feature.properties || {});
            if (label) return label;
        }
    }

    return '—';
}