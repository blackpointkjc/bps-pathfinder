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
        
        // Delete calls NOT from the three new sources
        try {
            const allCalls = await base44.asServiceRole.entities.DispatchCall.list();
            let deletedCount = 0;
            
            for (const call of allCalls) {
                if (!['richmond', 'henrico', 'chesterfield'].includes(call.source)) {
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    deletedCount++;
                }
            }
            console.log(`🗑️ Deleted ${deletedCount} non-approved source calls (old gractivecalls, etc)`);
        } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError.message);
        }
        
        const calls = [];
        
        // Source 1: Richmond (apps.richmondgov.com)
        try {
            console.log('📡 Scraping Richmond PD Active Calls...');
            const response1 = await fetch('https://apps.richmondgov.com/applications/activecalls', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response1.ok) {
                const html = await response1.text();
                const tableStart = html.indexOf('tblActiveCallsListing');
                
                if (tableStart !== -1) {
                    const tableEnd = html.indexOf('</table>', tableStart);
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
                        
                        // Format: Time Received, Agency, Dispatch Area, Unit, Call Type, Location, Status
                        if (cells.length >= 6 && cells[4] && cells[5]) {
                            const time = cells[0]?.trim() || '';
                            const agency = cells[1]?.trim() || 'RPD';
                            const incident = cells[4]?.trim() || 'Unknown';
                            const location = cells[5]?.trim() || '';
                            const status = cells[6]?.trim() || 'Dispatched';
                            
                            if (location && time) {
                                calls.push({ time, incident, location, agency, status, source: 'richmond' });
                            }
                        }
                    }
                }
                console.log(`✅ Richmond: ${calls.filter(c => c.source === 'richmond').length} calls`);
            }
        } catch (error) {
            console.error('❌ Richmond error:', error.message);
        }
        
        // Source 2: Henrico County
        try {
            console.log('📡 Scraping Henrico Active Calls...');
            const response2 = await fetch('https://activecalls.henrico.gov/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });

            if (response2.ok) {
                const html = await response2.text();
                const tableStart = html.indexOf('dgCalls');
                const tableEnd = html.indexOf('</table>', tableStart);

                if (tableStart !== -1 && tableEnd !== -1) {
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

                        // Format: ID, Block/Intersection, Received At, Incident, Call Status, Mag. Dist., PD
                        if (cells.length >= 4 && cells[1] && cells[3]) {
                            const time = cells[2]?.trim() || '';
                            const location = cells[1]?.trim() || '';
                            const incident = cells[3]?.trim() || 'Unknown';
                            const status = cells[4]?.trim() || 'Dispatched';
                            const agency = 'Henrico PD';

                            if (location && time) {
                                calls.push({ time, incident, location, agency, status, source: 'henrico' });
                            }
                        }
                    }
                }
                console.log(`✅ Henrico: ${calls.filter(c => c.source === 'henrico').length} calls`);
            }
        } catch (error) {
            console.error('❌ Henrico error:', error.message);
        }

        // Source 3: Chesterfield County (Parse from webpage)
        try {
            console.log('📡 Scraping Chesterfield Active Calls...');
            const response3 = await fetch('https://www.chesterfield.gov/3999/Active-Police-Calls', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });

            if (response3.ok) {
                const html = await response3.text();
                // Look for embedded data or AJAX data
                const scriptMatch = html.match(/var\s+activeCalls\s*=\s*(\[[\s\S]*?\]);/);
                
                if (scriptMatch) {
                    try {
                        const data = JSON.parse(scriptMatch[1]);
                        for (const call of data) {
                            const time = call.CallTime || call.time || '';
                            const incident = call.Description || call.IncidentType || 'Unknown';
                            const location = call.Location || call.location || '';
                            const status = call.Status || 'Dispatched';
                            const agency = 'CCPD';

                            if (location && time) {
                                calls.push({ time, incident, location, agency, status, source: 'chesterfield' });
                            }
                        }
                    } catch (parseError) {
                        console.warn('Could not parse Chesterfield JSON:', parseError.message);
                    }
                } else {
                    // Fallback: try to parse table data
                    const tableMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
                    for (const match of tableMatches) {
                        const row = match[1];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const cellMatch of cellMatches) {
                            cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
                        }
                        
                        if (cells.length >= 3) {
                            const time = cells[0]?.trim() || '';
                            const incident = cells[1]?.trim() || 'Unknown';
                            const location = cells[2]?.trim() || '';
                            
                            if (location && time) {
                                calls.push({ time, incident, location, agency: 'CCPD', status: 'Dispatched', source: 'chesterfield' });
                            }
                        }
                    }
                }
                console.log(`✅ Chesterfield: ${calls.filter(c => c.source === 'chesterfield').length} calls`);
            }
        } catch (error) {
            console.error('❌ Chesterfield error:', error.message);
        }
        
        console.log(`✅ Total scraped: ${calls.length} calls`);
        
        // Process and geocode each call
        let saved = 0;
        let geocoded = 0;
        let skipped = 0;
        let failed = 0;

        for (const call of calls) {
            try {
                const callId = `${call.source}-${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 150);

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
                    failed++;
                    continue;
                }

                let latitude = null;
                let longitude = null;

                // Attempt geocoding - but save call even if it fails
                console.log(`🔍 Geocoding: "${call.location}" → "${normalizedAddress}"`);
                const geoResult = await geocodeAddress(normalizedAddress);

                if (geoResult && isValidCoords(geoResult.latitude, geoResult.longitude)) {
                    latitude = geoResult.latitude;
                    longitude = geoResult.longitude;
                    geocoded++;
                    console.log(`✅ SUCCESS: ${latitude}, ${longitude}`);
                } else {
                    console.log(`⚠️ Geocoding failed, saving without coords: "${normalizedAddress}"`);
                    failed++;
                    // Continue to save call without coordinates
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
                
                // Save call (with or without coords)
                await base44.asServiceRole.entities.DispatchCall.create({
                    call_id: callId,
                    incident: call.incident,
                    location: call.location,
                    agency: call.agency,
                    status: call.status,
                    latitude: latitude,
                    longitude: longitude,
                    time_received: timeReceived.toISOString(),
                    description: `${call.incident} at ${call.location}`,
                    source: call.source
                });
                saved++;

                // Rate limiting - reduced to 600ms for faster processing
                await new Promise(resolve => setTimeout(resolve, 600));
                
            } catch (error) {
                console.error(`❌ Error processing call "${call.location}":`, error.message);
            }
        }
        
        console.log(`💾 FINAL: Scraped ${calls.length}, Saved ${saved} new, Geocoded ${geocoded}, Skipped ${skipped}, Failed ${failed}`);

        return Response.json({ 
            success: true, 
            scraped: calls.length, 
            saved,
            geocoded,
            skipped,
            failed,
            geocodeRate: saved > 0 ? `${Math.round((geocoded / saved) * 100)}%` : '0%'
        });
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});