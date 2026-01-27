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

// Normalize address for geocoding - NEVER return null, always attempt geocoding
const normalizeAddress = (location, agency) => {
    let normalized = location.trim();
    
    // Don't skip highways - try to geocode everything
    
    // Remove "Block" pattern: "200 Block N LABURNUM AVE" → "200 N LABURNUM AVE"
    normalized = normalized.replace(/(\d+)\s+Block\s+/gi, '$1 ');
    
    // Convert intersections: " / " → " & " (better for geocoding)
    normalized = normalized.replace(/\s*\/\s*/g, ' & ');
    
    // Determine city/state based on agency
    let cityState = 'Virginia';
    const agencyLower = agency.toLowerCase();
    
    if (agencyLower.includes('henrico') || agencyLower.includes('hpd') || agencyLower.includes('hcpd') || agencyLower.includes('hfd')) {
        cityState = 'Henrico County, VA';
    } else if (agencyLower.includes('richmond') || agencyLower.includes('rpd') || agencyLower.includes('rfd')) {
        cityState = 'Richmond, VA';
    } else if (agencyLower.includes('chesterfield') || agencyLower.includes('ccpd') || agencyLower.includes('ccfd')) {
        cityState = 'Chesterfield County, VA';
    }
    
    // Always return a geocodable address
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
                        if (cells.length >= 5) {
                            const time = cells[0]?.trim() || '';
                            const incident = cells[1]?.trim() || 'Unknown';
                            let location = cells[2]?.trim() || '';
                            let agency = cells[3]?.trim().toUpperCase() || '';
                            const status = cells[4]?.trim() || 'Dispatched';

                            // Extract coordinates if available in the location string
                            // Format might be: "123 MAIN ST (37.5407, -77.4360)"
                            let extractedLat = null;
                            let extractedLng = null;
                            const coordMatch = location.match(/\((-?\d+\.\d+),\s*(-?\d+\.\d+)\)/);
                            if (coordMatch) {
                                extractedLat = parseFloat(coordMatch[1]);
                                extractedLng = parseFloat(coordMatch[2]);
                                // Remove coordinates from location string
                                location = location.replace(/\s*\((-?\d+\.\d+),\s*(-?\d+\.\d+)\)/, '').trim();
                                console.log(`📍 Extracted coordinates from location: ${extractedLat}, ${extractedLng}`);
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

                            // DO NOT normalize location here - save raw location, normalize only during geocoding
                            if (location && time && incident) {
                                calls.push({ 
                                    time, 
                                    incident, 
                                    location, 
                                    agency, 
                                    status, 
                                    source,
                                    extractedLat,
                                    extractedLng
                                });
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

                // Always normalize address (never skip)
                const normalizedAddress = normalizeAddress(call.location, call.agency);

                let latitude = null;
                let longitude = null;
                let geocodeStatus = 'PENDING';
                let geocodeError = null;

                // Check if coordinates were extracted from gractivecalls
                if (call.extractedLat && call.extractedLng && isValidCoords(call.extractedLat, call.extractedLng)) {
                    latitude = call.extractedLat;
                    longitude = call.extractedLng;
                    geocodeStatus = 'SUCCESS';
                    geocoded++;
                    console.log(`✅ USING EXTRACTED COORDS: ${latitude}, ${longitude}`);
                } else {
                    // Attempt geocoding with timeout and retries
                    try {
                        console.log(`🔍 Geocoding: "${call.location}" → "${normalizedAddress}"`);
                        const geoPromise = geocodeAddress(normalizedAddress);
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Geocode timeout')), 5000)
                        );
                        const geoResult = await Promise.race([geoPromise, timeoutPromise]);

                        if (geoResult && isValidCoords(geoResult.latitude, geoResult.longitude)) {
                            latitude = geoResult.latitude;
                            longitude = geoResult.longitude;
                            geocodeStatus = 'SUCCESS';
                            geocoded++;
                            console.log(`✅ GEOCODE SUCCESS: ${latitude}, ${longitude}`);
                        } else {
                            geocodeStatus = 'FAILED';
                            geocodeError = 'No results from geocoder';
                            console.log(`⚠️ Geocoding failed: "${normalizedAddress}"`);
                            failed++;
                        }
                    } catch (geoError) {
                        geocodeStatus = 'FAILED';
                        geocodeError = geoError.message;
                        console.log(`⚠️ Geocoding error: ${geoError.message} for "${normalizedAddress}"`);
                        failed++;
                    }
                }
                
                // Use current time when app detected the call (not parsed website time)
                const timeReceived = new Date();
                console.log(`🕐 Call detected at: ${timeReceived.toLocaleString()} (original time: "${call.time}")`)
                
                // Save call (ALWAYS save, even without coords - NON-DESTRUCTIVE)
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
                    source: call.source,
                    priority: call.incident?.toLowerCase().includes('shooting') || 
                             call.incident?.toLowerCase().includes('officer down') || 
                             call.incident?.toLowerCase().includes('officer needs assistance') ? 'critical' : 'medium'
                });
                saved++;
                console.log(`💾 SAVED: ${call.agency} - ${call.incident} at ${call.location} (coords: ${latitude ? 'YES' : 'NO'})`);

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