import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting gractivecalls.com data ingestion...');
        
        // Fetch all active calls from the three official sources
        const sources = [
            { name: 'richmond', url: 'https://apps.richmondgov.com/applications/activecalls', code: 'RPD' },
            { name: 'henrico', url: 'https://web1.co.henrico.va.us/activecalls/', code: 'HPD' },
            { name: 'chesterfield', url: 'https://apps.chesterfield.gov/arcgis/rest/services/public/Public_Safety/FeatureServer/0/query?where=1%3D1&outFields=*&f=json', code: 'CCPD' }
        ];
        
        const allCalls = [];
        const errors = [];
        
        // Richmond City
        try {
            console.log('📡 Fetching Richmond calls...');
            const response = await fetch('https://apps.richmondgov.com/applications/activecalls');
            const html = await response.text();
            
            // Parse Richmond HTML table
            const rows = html.match(/<tr[^>]*>(.*?)<\/tr>/gs) || [];
            for (const row of rows) {
                const cells = row.match(/<td[^>]*>(.*?)<\/td>/gs) || [];
                if (cells.length >= 5) {
                    const timeReceived = cells[0].replace(/<[^>]*>/g, '').trim();
                    const incident = cells[2].replace(/<[^>]*>/g, '').trim();
                    const location = cells[3].replace(/<[^>]*>/g, '').trim();
                    
                    if (incident && location && incident.length > 2) {
                        const stableId = `rpd-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                        
                        // Geocode
                        let latitude = null, longitude = null;
                        try {
                            await new Promise(r => setTimeout(r, 150));
                            const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location + ', Richmond, Virginia')}&limit=1`, {
                                headers: { 'User-Agent': 'BPS-CAD/1.0' }
                            });
                            const geoData = await geoResp.json();
                            if (geoData[0]) {
                                latitude = parseFloat(geoData[0].lat);
                                longitude = parseFloat(geoData[0].lon);
                            }
                        } catch (e) {}
                        
                        allCalls.push({
                            call_id: stableId,
                            incident: incident,
                            location: location,
                            agency: 'RPD',
                            status: 'Active',
                            priority: 'medium',
                            time_received: new Date().toISOString(),
                            latitude: latitude,
                            longitude: longitude,
                            source: 'gractivecalls',
                            description: `${incident} at ${location}`
                        });
                    }
                }
            }
            console.log(`✅ Richmond: ${allCalls.length} calls`);
        } catch (e) {
            errors.push(`Richmond: ${e.message}`);
            console.error(`❌ Richmond failed:`, e);
        }
        
        // Henrico County
        try {
            console.log('📡 Fetching Henrico calls...');
            const response = await fetch('https://web1.co.henrico.va.us/activecalls/');
            const html = await response.text();
            
            const rows = html.match(/<tr[^>]*class="odd"|<tr[^>]*class="even"/g) || [];
            const henStartCount = allCalls.length;
            
            for (const row of rows) {
                const cells = html.substring(html.indexOf(row), html.indexOf(row) + 500).match(/<td[^>]*>(.*?)<\/td>/gs) || [];
                if (cells.length >= 4) {
                    const incident = cells[1].replace(/<[^>]*>/g, '').trim();
                    const location = cells[2].replace(/<[^>]*>/g, '').trim();
                    
                    if (incident && location && incident.length > 2) {
                        const stableId = `hpd-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                        
                        let latitude = null, longitude = null;
                        try {
                            await new Promise(r => setTimeout(r, 150));
                            const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location + ', Henrico, Virginia')}&limit=1`, {
                                headers: { 'User-Agent': 'BPS-CAD/1.0' }
                            });
                            const geoData = await geoResp.json();
                            if (geoData[0]) {
                                latitude = parseFloat(geoData[0].lat);
                                longitude = parseFloat(geoData[0].lon);
                            }
                        } catch (e) {}
                        
                        allCalls.push({
                            call_id: stableId,
                            incident: incident,
                            location: location,
                            agency: 'HPD',
                            status: 'Active',
                            priority: 'medium',
                            time_received: new Date().toISOString(),
                            latitude: latitude,
                            longitude: longitude,
                            source: 'gractivecalls',
                            description: `${incident} at ${location}`
                        });
                    }
                }
            }
            console.log(`✅ Henrico: ${allCalls.length - henStartCount} calls`);
        } catch (e) {
            errors.push(`Henrico: ${e.message}`);
            console.error(`❌ Henrico failed:`, e);
        }
        
        // Chesterfield County
        try {
            console.log('📡 Fetching Chesterfield calls...');
            const response = await fetch('https://apps.chesterfield.gov/arcgis/rest/services/public/Public_Safety/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json');
            const data = await response.json();
            const ccStartCount = allCalls.length;
            
            if (data.features) {
                for (const feature of data.features) {
                    const attrs = feature.attributes;
                    const incident = attrs.CallType || attrs.EventType || '';
                    const location = attrs.Address || attrs.Location || '';
                    
                    if (incident && location && incident.length > 2) {
                        const stableId = `ccpd-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                        const latitude = feature.geometry?.y || null;
                        const longitude = feature.geometry?.x || null;
                        
                        allCalls.push({
                            call_id: stableId,
                            incident: incident,
                            location: location,
                            agency: 'CCPD',
                            status: 'Active',
                            priority: 'medium',
                            time_received: new Date().toISOString(),
                            latitude: latitude ? parseFloat(latitude) : null,
                            longitude: longitude ? parseFloat(longitude) : null,
                            source: 'gractivecalls',
                            description: `${incident} at ${location}`
                        });
                    }
                }
            }
            console.log(`✅ Chesterfield: ${allCalls.length - ccStartCount} calls`);
        } catch (e) {
            errors.push(`Chesterfield: ${e.message}`);
            console.error(`❌ Chesterfield failed:`, e);
        }
        
        console.log(`✅ Total parsed: ${allCalls.length} calls`);
        console.log(`📍 Geocoded: ${allCalls.filter(c => c.latitude && c.longitude).length}`);
        
        // UPSERT logic
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        console.log(`📊 Found ${existingCalls.length} existing calls in database`);
        
        let inserted = 0;
        let updated = 0;
        
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
            } catch (e) {
                errors.push(`Upsert ${callData.call_id}: ${e.message}`);
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
        
        console.log(`💾 Database: ${inserted} created, ${updated} updated, ${deleted} deleted`);
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'gractivecalls-direct',
            total_parsed: allCalls.length,
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            geocoded: allCalls.filter(c => c.latitude && c.longitude).length,
            errors: errors.length > 0 ? errors : undefined
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