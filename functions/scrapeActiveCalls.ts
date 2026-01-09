import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Coordinate validation
const isValidCoords = (lat, lng) => {
    if (lat === null || lng === null || lat === undefined || lng === undefined) return false;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return false;
    if (latNum === 0 && lngNum === 0) return false;
    if (latNum < -90 || latNum > 90) return false;
    if (lngNum < -180 || lngNum > 180) return false;
    return true;
};

// Normalize address for geocoding
const normalizeAddress = (location, agency) => {
    let normalized = location.trim();
    
    // Skip highways/interstates
    if (normalized.match(/\bI-?\d+\b/) || normalized.match(/\bEN \d+[A-Z]?\b/)) {
        return null;
    }
    
    // Remove "Block" pattern: "200 Block N LABURNUM AVE" → "200 N LABURNUM AVE"
    normalized = normalized.replace(/(\d+)\s+Block\s+/gi, '$1 ');
    
    // Convert intersections: " / " → " AND "
    normalized = normalized.replace(/\s*\/\s*/g, ' AND ');
    
    // Determine city/state based on agency
    let cityState = 'Virginia';
    const agencyLower = agency.toLowerCase();
    
    if (agencyLower.includes('henrico')) {
        cityState = 'Henrico County, VA';
    } else if (agencyLower.includes('richmond') || agencyLower.includes('rpd') || agencyLower.includes('rfd')) {
        cityState = 'Richmond, VA';
    } else if (agencyLower.includes('chesterfield') || agencyLower.includes('ccpd') || agencyLower.includes('ccfd')) {
        cityState = 'Chesterfield County, VA';
    }
    
    return `${normalized}, ${cityState}`;
};

// Geocode cache (in-memory for this execution)
const geocodeCache = new Map();

// Geocode address using Nominatim
const geocodeAddress = async (normalizedAddress) => {
    if (geocodeCache.has(normalizedAddress)) {
        return geocodeCache.get(normalizedAddress);
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedAddress)}&limit=1`,
            {
                headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' },
                signal: AbortSignal.timeout(5000)
            }
        );
        
        if (!response.ok) {
            geocodeCache.set(normalizedAddress, null);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon),
                provider: 'nominatim',
                confidence: data[0].type || 'unknown'
            };
            geocodeCache.set(normalizedAddress, result);
            return result;
        }
        
        geocodeCache.set(normalizedAddress, null);
        return null;
    } catch (error) {
        console.error(`Geocode error for "${normalizedAddress}":`, error.message);
        geocodeCache.set(normalizedAddress, null);
        return null;
    }
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🔍 Starting active call scraper...');
        
        const calls = [];
        
        // Source 1: gractivecalls.com (Richmond + Chesterfield)
        try {
            console.log('📡 Scraping gractivecalls.com...');
            const response1 = await fetch('https://gractivecalls.com/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response1.ok) {
                const html = await response1.text();
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        if (cells.length >= 5 && cells[2] && cells[1]) {
                            const time = cells[0];
                            const incident = cells[1].trim();
                            const location = cells[2].trim();
                            const agency = cells[3]?.trim() || 'Unknown';
                            const status = cells[4]?.trim() || 'Dispatched';
                            
                            if (location && !/^\d{1,2}:\d{2}/.test(location)) {
                                calls.push({ time, incident, location, agency, status, source: 'gractivecalls' });
                            }
                        }
                    }
                }
                console.log(`✅ gractivecalls: ${calls.length} calls`);
            }
        } catch (error) {
            console.error('❌ gractivecalls error:', error.message);
        }
        
        // Source 2: Henrico County
        try {
            console.log('📡 Scraping Henrico...');
            const response2 = await fetch('https://activecalls.henrico.gov/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response2.ok) {
                const html = await response2.text();
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        if (cells.length >= 4 && cells[1] && cells[2]) {
                            const time = cells[0];
                            const incident = cells[1].trim();
                            const location = cells[2].trim();
                            const status = cells[3]?.trim() || 'Dispatched';
                            
                            if (location && !/^\d{1,2}:\d{2}/.test(location)) {
                                const incidentLower = incident.toLowerCase();
                                let agency = 'Henrico Police';
                                
                                if (incidentLower.includes('fire') || incidentLower.includes('medical') || 
                                    incidentLower.includes('rescue') || incidentLower.includes('ems')) {
                                    agency = 'Henrico Fire';
                                }
                                
                                calls.push({ time, incident, location, agency, status, source: 'henrico' });
                            }
                        }
                    }
                }
                console.log(`✅ Henrico: Total ${calls.filter(c => c.source === 'henrico').length} calls`);
            }
        } catch (error) {
            console.error('❌ Henrico error:', error.message);
        }
        
        console.log(`✅ Total scraped: ${calls.length} calls`);
        
        // Process and geocode each call
        let saved = 0;
        let geocoded = 0;
        let skipped = 0;
        
        for (const call of calls) {
            try {
                const callId = `${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 100);
                
                // Check if call already exists
                const existing = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                
                if (existing && existing.length > 0) {
                    skipped++;
                    continue;
                }
                
                // Normalize address
                const normalizedAddress = normalizeAddress(call.location, call.agency);
                
                if (!normalizedAddress) {
                    console.log(`⏭️ Skipping highway/interstate: ${call.location}`);
                    continue;
                }
                
                let latitude = null;
                let longitude = null;
                let coordsStatus = 'missing_or_invalid';
                let geocodeProvider = null;
                let geocodeConfidence = null;
                
                // Attempt geocoding
                const geoResult = await geocodeAddress(normalizedAddress);
                
                if (geoResult && isValidCoords(geoResult.latitude, geoResult.longitude)) {
                    latitude = geoResult.latitude;
                    longitude = geoResult.longitude;
                    coordsStatus = 'geocoded';
                    geocodeProvider = geoResult.provider;
                    geocodeConfidence = geoResult.confidence;
                    geocoded++;
                    console.log(`✅ Geocoded: "${call.location}" → ${latitude}, ${longitude}`);
                } else {
                    coordsStatus = 'needs_manual_review';
                    console.log(`⚠️ Failed to geocode: "${call.location}"`);
                }
                
                // Parse time from call.time (format: "HH:MM AM/PM")
                let timeReceived = new Date();
                if (call.time && /\d{1,2}:\d{2}/.test(call.time)) {
                    const timeParts = call.time.match(/(\d{1,2}):(\d{2})\s?(AM|PM)?/i);
                    if (timeParts) {
                        let hours = parseInt(timeParts[1]);
                        const minutes = parseInt(timeParts[2]);
                        const period = timeParts[3];
                        
                        if (period) {
                            if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
                            if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
                        }
                        
                        timeReceived = new Date();
                        timeReceived.setHours(hours, minutes, 0, 0);
                        
                        // If the time is in the future, it's from yesterday
                        if (timeReceived > new Date()) {
                            timeReceived.setDate(timeReceived.getDate() - 1);
                        }
                    }
                }
                
                // Save call with geocoded coords
                await base44.asServiceRole.entities.DispatchCall.create({
                    call_id: callId,
                    incident: call.incident,
                    location: call.location,
                    agency: call.agency,
                    status: call.status,
                    latitude: latitude,
                    longitude: longitude,
                    time_received: timeReceived.toISOString(),
                    description: `${call.incident} at ${call.location}`
                });
                saved++;
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1100));
                
            } catch (error) {
                console.error(`❌ Error processing call "${call.location}":`, error.message);
            }
        }
        
        console.log(`💾 FINAL: Scraped ${calls.length}, Saved ${saved} new, Geocoded ${geocoded}, Skipped ${skipped}`);
        
        return Response.json({ 
            success: true, 
            scraped: calls.length, 
            saved,
            geocoded,
            skipped,
            geocodeRate: saved > 0 ? `${Math.round((geocoded / saved) * 100)}%` : '0%'
        });
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});