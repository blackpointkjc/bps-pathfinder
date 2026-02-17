import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0';

// Haversine distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting active calls ingestion from gractivecalls.com...');
        
        // Fetch live data from gractivecalls.com
        const response = await fetch('https://gractivecalls.com');
        if (!response.ok) {
            throw new Error(`Failed to fetch gractivecalls.com: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const allCalls = [];
        
        // Parse each table row
        $('table tbody tr').each((_, row) => {
            const $row = $(row);
            const cells = $row.find('td');
            
            if (cells.length >= 5) {
                const timeReceived = $(cells[0]).text().trim();
                const incident = $(cells[1]).text().trim();
                const location = $(cells[2]).text().trim();
                const agency = $(cells[3]).text().trim();
                const status = $(cells[4]).text().trim();
                
                if (incident && location && agency) {
                    const stableId = `${agency.toLowerCase()}-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                    
                    // Geocode the location
                    let latitude = null;
                    let longitude = null;
                    try {
                        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location + ', Virginia, USA')}&limit=1`;
                        const geocodeRes = await fetch(geocodeUrl, {
                            headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' }
                        });
                        const geocodeData = await geocodeRes.json();
                        if (geocodeData && geocodeData.length > 0) {
                            latitude = parseFloat(geocodeData[0].lat);
                            longitude = parseFloat(geocodeData[0].lon);
                        }
                        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
                    } catch (geocodeError) {
                        console.error(`Geocoding failed for ${location}:`, geocodeError.message);
                    }
                    
                    allCalls.push({
                        call_id: stableId,
                        incident: incident,
                        location: location,
                        agency: agency,
                        status: status || 'Active',
                        priority: 'medium',
                        time_received: timeReceived || new Date().toISOString(),
                        source: 'gractivecalls',
                        description: `${incident} at ${location}`,
                        latitude: latitude,
                        longitude: longitude
                    });
                }
            }
        });
        
        console.log(`✅ Scraped ${allCalls.length} calls from gractivecalls.com`);
        
        // Fetch existing calls from this source
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        console.log(`📊 Found ${existingCalls.length} existing calls in database`);
        
        // Remove expired calls (older than 60 minutes) and track what's not expired
        const now = new Date();
        const expirationThreshold = 60 * 60 * 1000;
        let expired = 0;
        const activeExisting = [];
        
        for (const call of existingCalls) {
            if (call.time_received) {
                const ageMs = now - new Date(call.time_received);
                if (ageMs > expirationThreshold) {
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    expired++;
                    continue;
                }
            }
            activeExisting.push(call);
        }
        
        console.log(`🗑️ Expired ${expired} calls older than 60 minutes`);
        
        let inserted = 0;
        let updated = 0;
        
        for (const callData of allCalls) {
            const existing = activeExisting.find(c => c.call_id === callData.call_id);
            if (existing) {
                await base44.asServiceRole.entities.DispatchCall.update(existing.id, callData);
                updated++;
            } else {
                await base44.asServiceRole.entities.DispatchCall.create(callData);
                inserted++;
            }
        }
        
        const newCallIds = new Set(allCalls.map(c => c.call_id));
        let deleted = 0;
        for (const existing of activeExisting) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
            }
        }
        
        console.log(`💾 Database: ${inserted} created, ${updated} updated, ${deleted} deleted`);
        
        // Property alert checking
        let alertsCreated = 0;
        try {
            const properties = await base44.asServiceRole.entities.MonitoredProperty.filter({ enabled: true });
            
            if (properties.length > 0) {
                console.log(`📍 Checking ${allCalls.length} calls against ${properties.length} monitored properties`);
                
                for (const call of allCalls) {
                    if (!call.latitude || !call.longitude) continue;
                    
                    for (const property of properties) {
                        const distance = calculateDistance(
                            call.latitude, call.longitude,
                            property.latitude, property.longitude
                        );
                        
                        if (distance <= property.radiusMeters) {
                            // Check if alert already exists
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
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            expired: expired,
            alerts_created: alertsCreated
        });
        
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        return Response.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});