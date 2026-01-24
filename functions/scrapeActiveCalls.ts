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
        
        // Delete ALL existing calls from gractivecalls source to refresh
        try {
            const existingCalls = await base44.asServiceRole.entities.DispatchCall.list();
            let deletedCount = 0;
            
            for (const call of existingCalls) {
                // Delete all gractivecalls sourced calls for fresh scrape
                if (call.source === 'gractivecalls') {
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    deletedCount++;
                    // Rate limit deletions
                    if (deletedCount % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
            console.log(`🗑️ Deleted ${deletedCount} gractivecalls.com calls for fresh scrape`);
        } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError.message);
        }
        
        // Ingestion diagnostics
        const diagnostics = {
            agencies: new Set(),
            parseErrors: 0,
            totalRows: 0
        };
        
        const calls = [];

        // Source: gractivecalls.com (Richmond and Henrico)
        try {
            console.log('📡 Scraping gractivecalls.com...');
            const response = await fetch('https://gractivecalls.com/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });

            if (response.ok) {
                const html = await response.text();
                console.log(`gractivecalls.com HTML length: ${html.length}`);

                // Find the table with active calls (looking for tbody specifically)
                const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);

                if (tbodyMatch) {
                    const rows = tbodyMatch[1].split(/<tr[^>]*>/i);
                    console.log(`Found ${rows.length} rows in gractivecalls table`);

                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        diagnostics.totalRows++;
                        
                        if (!row.includes('<td')) continue;

                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);

                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }

                        // Format from gractivecalls: Time Received, Incident, Location, Agency, Status, Actions
                        // BUT the HTML structure includes an h2 header row for each incident, so we need to extract from it
                        if (cells.length >= 5) {
                            let time = cells[0]?.trim() || '';
                            let incident = cells[1]?.trim() || 'Unknown';
                            let location = cells[2]?.trim() || '';
                            let agency = cells[3]?.trim().toUpperCase() || '';
                            const status = cells[4]?.trim() || 'Dispatched';
                            
                            // Check if this is actually the header row with format: "INCIDENT at LOCATION (AGENCY)"
                            if (incident.includes(' at ') && incident.includes('(') && incident.includes(')')) {
                                // Extract from header format: "PUBLIC SERVICE at OSBORNE RD / ROUTE 1 (CCFD)"
                                const headerMatch = incident.match(/^(.+?)\s+at\s+(.+?)\s+\(([A-Z]{2,6})\)$/);
                                if (headerMatch) {
                                    incident = headerMatch[1].trim();
                                    location = headerMatch[2].trim();
                                    agency = headerMatch[3].trim().toUpperCase();
                                    // time is in next cell
                                    console.log(`📋 Parsed header: ${incident} at ${location} [${agency}]`);
                                }
                            }

                            // Normalize agency code: accept 2-6 uppercase letters
                            const agencyMatch = agency.match(/^[A-Z]{2,6}$/);
                            if (!agencyMatch && agency) {
                                console.warn(`⚠️ Non-standard agency code: "${agency}" - keeping raw value`);
                            }
                            
                            // Track all agency codes found
                            if (agency) {
                                diagnostics.agencies.add(agency);
                            }

                            // ALL calls from gractivecalls get source='gractivecalls' (no filtering by agency)
                            const source = 'gractivecalls';

                            location = normalizeAddress(location, agency);

                            if (location && time && incident) {
                                calls.push({ time, incident, location, agency, status, source });
                            } else {
                                diagnostics.parseErrors++;
                                console.warn(`⚠️ Parse error - missing required fields: time="${time}" incident="${incident}" location="${location}"`);
                            }
                        } else {
                            diagnostics.parseErrors++;
                        }
                    }
                    console.log(`✅ gractivecalls.com: ${calls.length} calls`);
                } else {
                    console.warn('⚠️ Could not find tbody in gractivecalls.com');
                }
            }
        } catch (error) {
            console.error('❌ gractivecalls.com error:', error.message);
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

                // Skip duplicate check - we already deleted old calls, now we refresh all active ones

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
                
                // Parse time from call.time - gractivecalls shows "MM/DD/YYYY HH:MM AM/PM" format
                let timeReceived = new Date();
                if (call.time && call.time.trim()) {
                    // Try full format: "01/24/2026 10:30 AM"
                    const fullMatch = call.time.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?:\s?(AM|PM))?/i);
                    if (fullMatch) {
                        const month = parseInt(fullMatch[1]) - 1; // JS months are 0-indexed
                        const day = parseInt(fullMatch[2]);
                        const year = parseInt(fullMatch[3]);
                        let hours = parseInt(fullMatch[4]);
                        const minutes = parseInt(fullMatch[5]);
                        const period = fullMatch[6];
                        
                        // Handle 12-hour format
                        if (period) {
                            if (period.toUpperCase() === 'PM' && hours !== 12) {
                                hours += 12;
                            }
                            if (period.toUpperCase() === 'AM' && hours === 12) {
                                hours = 0;
                            }
                        }
                        
                        timeReceived = new Date(year, month, day, hours, minutes, 0, 0);
                        console.log(`🕐 Parsed full time: "${call.time}" → ${timeReceived.toLocaleString()}`);
                    } else {
                        // Fallback to time only
                        const timeMatch = call.time.match(/(\d{1,2}):(\d{2})(?:\s?(AM|PM))?/i);
                        if (timeMatch) {
                            let hours = parseInt(timeMatch[1]);
                            const minutes = parseInt(timeMatch[2]);
                            const period = timeMatch[3];
                            
                            if (period) {
                                if (period.toUpperCase() === 'PM' && hours !== 12) {
                                    hours += 12;
                                }
                                if (period.toUpperCase() === 'AM' && hours === 12) {
                                    hours = 0;
                                }
                            }
                            
                            const now = new Date();
                            timeReceived = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
                            console.log(`🕐 Parsed time only: "${call.time}" → ${timeReceived.toLocaleString()}`);
                        } else {
                            console.warn(`⚠️ Could not parse time: "${call.time}"`);
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
        console.log(`📊 DIAGNOSTICS: Total rows: ${diagnostics.totalRows}, Parse errors: ${diagnostics.parseErrors}`);
        console.log(`🏢 AGENCIES DETECTED: ${Array.from(diagnostics.agencies).sort().join(', ')}`);

        return Response.json({ 
            success: true, 
            scraped: calls.length, 
            saved,
            geocoded,
            skipped,
            failed,
            geocodeRate: saved > 0 ? `${Math.round((geocoded / saved) * 100)}%` : '0%',
            diagnostics: {
                totalRows: diagnostics.totalRows,
                parseErrors: diagnostics.parseErrors,
                agenciesDetected: Array.from(diagnostics.agencies).sort()
            }
        });
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});