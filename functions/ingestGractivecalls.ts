import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0';

// Haversine distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Parse full date strings from gractivecalls.com
// Format examples: "02/17/2026 8:51 PM", "02/17/2026 10:05 AM"
// The site is Richmond VA — times are always Eastern
function parseTimeToISO(timeStr) {
    if (!timeStr) return new Date().toISOString();

    // Try full date+time format: "MM/DD/YYYY H:MM AM/PM"
    const fullMatch = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (fullMatch) {
        const [, month, day, year, rawHour, minutes, ampm] = fullMatch;
        let hour = parseInt(rawHour);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;

        const pad = (n) => String(n).padStart(2, '0');

        // Determine EST (-5) vs EDT (-4) offset for that date
        const testDate = new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00Z`);
        const tzName = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            timeZoneName: 'shortOffset'
        }).formatToParts(testDate).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
        const offsetHours = tzName.includes('-4') ? 4 : 5;

        // Build UTC by SUBTRACTING the offset from the Eastern local time
        // e.g. 8:51 PM EST (-5) → 8:51 PM + 5h = 1:51 AM UTC next day
        const utcDate = new Date(Date.UTC(
            parseInt(year), parseInt(month) - 1, parseInt(day),
            hour + offsetHours, parseInt(minutes), 0
        ));
        return utcDate.toISOString();
    }

    // Fallback: bare "HH:MM" 24-hour (treat as Eastern today)
    const timeOnly = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeOnly) {
        const nowEastern = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const d = new Date(nowEastern);
        d.setHours(parseInt(timeOnly[1]), parseInt(timeOnly[2]), 0, 0);
        return d.toISOString();
    }

    return new Date().toISOString();
}

// Free geocoding via Nominatim (no credits used)
async function geocodeAddress(address) {
    try {
        const query = encodeURIComponent(address + ', Virginia, USA');
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=us`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0 (emergency-services)' }
        });
        const data = await res.json();
        if (data && data.length > 0) {
            return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
        }
    } catch (e) {
        // Silent fail
    }
    return null;
}

// Sleep helper for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Allow both authenticated user calls AND scheduled automation calls (no user context)
        // For scheduled runs, we use service role only
        
        console.log('🚨 Starting active calls ingestion from gractivecalls.com...');
        
        // Use the JSON API endpoint for reliable structured data (includes CCPD/CCFD)
        const apiResponse = await fetch('https://gractivecalls.com/api/calls', {
            headers: { 
                'User-Agent': 'BPS-CAD-Dispatch/1.0',
                'Accept': 'application/json'
            }
        });
        
        if (!apiResponse.ok) {
            throw new Error(`Failed to fetch gractivecalls.com API: ${apiResponse.status}`);
        }
        
        const apiData = await apiResponse.json();
        console.log(`📡 API returned ${apiData.length} calls`);
        
        // Fetch status from the HTML page for calls that need it
        // (the API might not include status, so we also parse HTML as a fallback)
        let statusMap = {};
        try {
            const htmlResponse = await fetch('https://gractivecalls.com', {
                headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0' }
            });
            if (htmlResponse.ok) {
                const html = await htmlResponse.text();
                const $ = cheerio.load(html);
                $('table tbody tr').each((_, row) => {
                    const cells = $(row).find('td');
                    if (cells.length >= 5) {
                        const incident = $(cells[1]).text().trim();
                        const location = $(cells[2]).text().trim();
                        const agency = $(cells[3]).text().trim();
                        const status = $(cells[4]).text().trim();
                        if (incident && location && agency) {
                            const key = `${agency}-${incident}-${location}`;
                            statusMap[key] = status;
                        }
                    }
                });
            }
        } catch (e) {
            console.log('HTML status fetch failed, using default status');
        }
        
        const allCalls = [];
        const seenIds = new Set();
        
        for (const entry of apiData) {
            const agency = entry.agency || '';
            const incident = entry.incident || '';
            const location = entry.location || '';
            const timeReceived = entry.timeReceived || '';
            const statusKey = `${agency}-${incident}-${location}`;
            const status = statusMap[statusKey] || entry.status || 'Active';
            
            if (!incident || !location || !agency) continue;
            
            const incidentSlug = incident.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 30);
            const locationSlug = location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40);
            const stableId = `${agency.toLowerCase()}-${incidentSlug}-${locationSlug}`;
            
            if (!seenIds.has(stableId)) {
                seenIds.add(stableId);
                allCalls.push({
                    call_id: stableId,
                    incident: incident,
                    location: location,
                    agency: agency,
                    status: status,
                    priority: 'medium',
                    time_received: typeof timeReceived === 'string' && timeReceived.includes('T') 
                        ? timeReceived  // Already ISO format from the API
                        : parseTimeToISO(timeReceived),
                    source: 'gractivecalls',
                    description: `${incident} at ${location}`
                });
            }
        }
        
        const agenciesFound = [...new Set(allCalls.map(c => c.agency))];
        console.log(`🏢 Agencies found: ${agenciesFound.join(', ')}`);
        
        console.log(`✅ Scraped ${allCalls.length} calls from gractivecalls.com`);
        
        // Fetch existing calls from this source
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        console.log(`📊 Found ${existingCalls.length} existing calls in database`);
        
        // Do NOT expire calls by age — the live site is the single source of truth.
        // Calls will be removed below if they no longer appear on gractivecalls.com.
        const activeExisting = existingCalls;
        let expired = 0;
        
        console.log(`📋 Keeping all ${activeExisting.length} existing calls — will sync with live site`);
        
        let inserted = 0;
        let updated = 0;
        let geocoded = 0;
        
        for (const callData of allCalls) {
             const existing = activeExisting.find(c => c.call_id === callData.call_id);

             // Always geocode if missing coords
             if (!callData.latitude || !callData.longitude) {
                 const coords = await geocodeAddress(callData.location);
                 if (coords) {
                     callData.latitude = coords.latitude;
                     callData.longitude = coords.longitude;
                     geocoded++;
                     console.log(`📍 Geocoded: ${callData.location} → (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
                 } else {
                     console.log(`❌ Could not geocode: ${callData.location}`);
                 }
                 await sleep(1100);
             }

             if (existing) {
                 const updateData = {
                     status: callData.status,
                     time_received: callData.time_received,
                     latitude: callData.latitude,
                     longitude: callData.longitude
                 };

                 await base44.asServiceRole.entities.DispatchCall.update(existing.id, updateData);
                 updated++;
             } else {
                 await base44.asServiceRole.entities.DispatchCall.create(callData);
                 inserted++;
             }
        }
        
        // Delete calls no longer on the site (most important — keeps DB in sync with live site)
        const newCallIds = new Set(allCalls.map(c => c.call_id));
        let deleted = 0;
        for (const existing of activeExisting) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
                console.log(`🗑️ Removed from site: ${existing.incident} @ ${existing.location}`);
            }
        }
        
        console.log(`💾 Database: ${inserted} created (${geocoded} geocoded), ${updated} updated, ${deleted} deleted`);
        
        // Property alert checking
        let alertsCreated = 0;
        try {
            const properties = await base44.asServiceRole.entities.MonitoredProperty.filter({ enabled: true });
            
            if (properties.length > 0) {
                const callsWithCoords = allCalls.filter(c => c.latitude && c.longitude);
                console.log(`📍 Checking ${callsWithCoords.length} geocoded calls against ${properties.length} monitored properties`);
                
                for (const call of callsWithCoords) {
                    for (const property of properties) {
                        const distance = calculateDistance(
                            call.latitude, call.longitude,
                            property.latitude, property.longitude
                        );
                        
                        if (distance <= property.radiusMeters) {
                            const existingAlert = await base44.asServiceRole.entities.PropertyAlert.filter({
                                callId: call.call_id,
                                propertyId: property.id
                            });
                            
                            if (existingAlert.length === 0) {
                                await base44.asServiceRole.entities.PropertyAlert.create({
                                    callId: call.call_id,
                                    propertyId: property.id,
                                    propertyName: property.name,
                                    callIncident: call.incident,
                                    callLocation: call.location,
                                    distanceMeters: Math.round(distance),
                                    acknowledged: false
                                });
                                alertsCreated++;
                                console.log(`🚨 Alert: ${call.incident} within ${Math.round(distance)}m of ${property.name}`);
                            }
                        }
                    }
                }
            }
        } catch (alertError) {
            console.error('❌ Property alert check failed:', alertError);
        }
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'gractivecalls.com',
            total_parsed: allCalls.length,
            inserted,
            updated,
            deleted,
            expired,
            geocoded,
            alerts_created: alertsCreated
        });
        
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});