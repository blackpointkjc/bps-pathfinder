import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting active calls ingestion from Afroraydude API...');
        
        // Fetch from the API endpoints for each jurisdiction
        const jurisdictions = [
            { name: 'richmond', code: 'RPD', apiUrl: 'https://api.afroraydude.com/activeCalls/richmond' },
            { name: 'henrico', code: 'HPD', apiUrl: 'https://api.afroraydude.com/activeCalls/henrico' },
            { name: 'chesterfield', code: 'CCPD', apiUrl: 'https://api.afroraydude.com/activeCalls/chesterfield' }
        ];
        
        const allCalls = [];
        const errors = [];
        
        for (const jurisdiction of jurisdictions) {
            try {
                console.log(`📡 Fetching ${jurisdiction.name} calls...`);
                const response = await fetch(jurisdiction.apiUrl, {
                    headers: {
                        'User-Agent': 'BPS-Dispatch-CAD/1.0'
                    }
                });
                
                if (!response.ok) {
                    errors.push(`${jurisdiction.name}: HTTP ${response.status}`);
                    console.error(`❌ ${jurisdiction.name} failed: ${response.status}`);
                    continue;
                }
                
                const data = await response.json();
                const calls = Array.isArray(data) ? data : (data.calls || []);
                console.log(`✅ ${jurisdiction.name}: ${calls.length} calls`);
                
                // Parse each call
                for (const call of calls) {
                    try {
                        const incident = call.incident || call.type || call.callType || '';
                        const location = call.location || call.address || '';
                        const timeReceived = call.time || call.timestamp || call.timeReceived || new Date().toISOString();
                        const agency = call.agency || jurisdiction.code;
                        const status = call.status || 'Active';
                        
                        if (!incident || !location) {
                            console.log(`  ⚠️ Skipped call: missing incident or location`);
                            continue;
                        }
                        
                        // Geocode location
                        let latitude = null;
                        let longitude = null;
                        
                        try {
                            await new Promise(resolve => setTimeout(resolve, 150));
                            const geocodeQuery = `${location}, ${jurisdiction.name}, Virginia, USA`;
                            const geocodeResponse = await fetch(
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=1`,
                                { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } }
                            );
                            const geocodeData = await geocodeResponse.json();
                            
                            if (geocodeData && geocodeData.length > 0) {
                                latitude = parseFloat(geocodeData[0].lat);
                                longitude = parseFloat(geocodeData[0].lon);
                            }
                        } catch (geocodeError) {
                            console.error(`  ❌ Geocoding failed:`, geocodeError.message);
                        }
                        
                        // Generate stable ID
                        const cleanLocation = location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
                        const stableId = `${jurisdiction.code.toLowerCase()}-${cleanLocation}`;
                        
                        // Parse timestamp
                        let parsedTime = new Date().toISOString();
                        try {
                            if (timeReceived.includes('/') || timeReceived.includes('-')) {
                                parsedTime = new Date(timeReceived).toISOString();
                            }
                        } catch {
                            // Use current time as fallback
                        }
                        
                        allCalls.push({
                            call_id: stableId,
                            incident: incident,
                            location: location,
                            agency: agency,
                            status: status,
                            priority: 'medium',
                            time_received: parsedTime,
                            latitude: latitude,
                            longitude: longitude,
                            source: 'gractivecalls',
                            description: `${incident} at ${location}`
                        });
                        
                    } catch (callError) {
                        errors.push(`Parse error: ${callError.message}`);
                    }
                }
                
            } catch (jurisdictionError) {
                errors.push(`${jurisdiction.name}: ${jurisdictionError.message}`);
                console.error(`❌ ${jurisdiction.name} error:`, jurisdictionError);
            }
        }
        
        console.log(`✅ Total parsed: ${allCalls.length} calls`);
        console.log(`📍 Geocoded: ${allCalls.filter(c => c.latitude && c.longitude).length}`);
        
        // UPSERT logic
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        console.log(`📊 Found ${existingCalls.length} existing calls in database`);
        
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        
        for (const callData of allCalls) {
            try {
                const existing = existingCalls.find(c => c.call_id === callData.call_id);
                
                if (existing) {
                    await base44.asServiceRole.entities.DispatchCall.update(existing.id, callData);
                    updated++;
                } else {
                    await base44.asServiceRole.entities.DispatchCall.create(callData);
                    inserted++;
                }
            } catch (upsertError) {
                errors.push(`Upsert failed for ${callData.call_id}: ${upsertError.message}`);
                skipped++;
            }
        }
        
        // Delete stale calls
        const newCallIds = new Set(allCalls.map(c => c.call_id));
        let deleted = 0;
        for (const existing of existingCalls) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
            }
        }
        
        console.log(`💾 Database: ${inserted} created, ${updated} updated, ${deleted} deleted, ${skipped} failed`);
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'afroraydude-api',
            total_parsed: allCalls.length,
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            geocoded: allCalls.filter(c => c.latitude && c.longitude).length,
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined
        });
        
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        return Response.json({
            success: false,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
});