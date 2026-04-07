/**
 * Given lat/lng, queries ArcGIS services to find the containing police beat / district.
 * Returns a human-readable string like "Richmond Beat 111A" or null.
 */
function fetchWithTimeout(url, ms = 5000) {
    return Promise.race([
        fetch(url).then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

export async function lookupDistrict(lat, lng) {
    if (!lat || !lng) return null;
    const point = `${lng},${lat}`;
    const qs = `geometry=${point}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json`;

    const [richmond, henrico, chesterfield] = await Promise.allSettled([
        fetchWithTimeout(`https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/Police_Beats/FeatureServer/0/query?${qs}&outFields=Name`),
        fetchWithTimeout(`https://portal.henrico.gov/mapping/rest/services/Layers/Magisterial_Districts_2021/MapServer/0/query?${qs}&outFields=MAG_DIST_NAME,NAME`),
        fetchWithTimeout(`https://services3.arcgis.com/TsynfzBSE6sXfoLq/ArcGIS/rest/services/Administrative_ProdA/FeatureServer/9/query?${qs}&outFields=*`),
    ]);

    if (richmond.status === 'fulfilled' && richmond.value.features?.length > 0) {
        const beat = richmond.value.features[0].attributes?.Name;
        if (beat) return `Richmond Beat ${beat}`;
    }
    if (henrico.status === 'fulfilled' && henrico.value.features?.length > 0) {
        const attrs = henrico.value.features[0].attributes || {};
        const name = attrs.MAG_DIST_NAME || attrs.NAME;
        if (name) return `Henrico — ${name}`;
    }
    if (chesterfield.status === 'fulfilled' && chesterfield.value.features?.length > 0) {
        const attrs = chesterfield.value.features[0].attributes || {};
        const name = Object.values(attrs).find(v => typeof v === 'string' && v.length > 1 && v.length < 40);
        if (name) return `Chesterfield — ${name}`;
    }
    return 'Unknown';
}