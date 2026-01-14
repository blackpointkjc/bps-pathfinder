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
                console.log(`Richmond HTML length: ${html.length}`);
                
                // Try multiple table ID patterns
                const patterns = [
                    /<table[^>]*id="tblActiveCallsListing"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
                    /<table[^>]*id="ctl00_MainContent_gvCalls"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
                    /<tbody>([\s\S]*?)<\/tbody>/i
                ];
                
                let tbodyMatch = null;
                for (const pattern of patterns) {
                    tbodyMatch = html.match(pattern);
                    if (tbodyMatch && tbodyMatch[1]) break;
                }
                
                if (tbodyMatch && tbodyMatch[1]) {
                    const tbody = tbodyMatch[1];
                    const rows = tbody.split(/<tr[^>]*>/i);
                    console.log(`Found ${rows.length} rows in Richmond table`);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        // Format: [0] Time Received, [1] Agency, [2] Dispatch Area, [3] Unit, [4] Call Type, [5] Location, [6] Status
                                        if (cells.length >= 7) {
                                            let time = cells[0]?.trim() || '';
                                            const agency = cells[1]?.trim() || 'RPD';
                                            const incident = cells[4]?.trim() || 'Unknown';
                                            let location = cells[5]?.trim() || '';
                                            const status = cells[6]?.trim() || 'Dispatched';

                                            location = normalizeAddress(location, 'Richmond');

                                            if (location && time) {
                                                calls.push({ time, incident, location, agency, status, source: 'richmond' });
                                            }
                                        }
                    }
                } else {
                    console.warn('⚠️ Could not find Richmond table tbody');
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
                                            let location = cells[1]?.trim() || '';
                                            const incident = cells[3]?.trim() || 'Unknown';
                                            const status = cells[4]?.trim() || 'Dispatched';
                                            const agency = 'Henrico PD';

                                            // Normalize Henrico address
                                            location = normalizeAddress(location, 'Henrico');

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

        // Source 3: Chesterfield County - skip, handled by dedicated scraper
        console.log('⏭️ Chesterfield: Handled by scrapeChesterfieldActiveCalls');
        
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

                // Attempt geocoding with timeout
                try {
                    console.log(`🔍 Geocoding: "${call.location}" → "${normalizedAddress}"`);
                    const geoPromise = geocodeAddress(normalizedAddress);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Geocode timeout')), 3000)
                    );
                    const geoResult = await Promise.race([geoPromise, timeoutPromise]);

                    if (geoResult && isValidCoords(geoResult.latitude, geoResult.longitude)) {
                        latitude = geoResult.latitude;
                        longitude = geoResult.longitude;
                        geocoded++;
                        console.log(`✅ SUCCESS: ${latitude}, ${longitude}`);
                    } else {
                        console.log(`⚠️ Geocoding failed, saving without coords: "${normalizedAddress}"`);
                        failed++;
                    }
                } catch (geoError) {
                    console.log(`⚠️ Geocoding timeout/error, saving without coords: "${normalizedAddress}"`);
                    failed++;
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