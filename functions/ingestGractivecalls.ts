import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting active calls ingestion from Richmond data sources...');
        
        const allCalls = [];
        const errors = [];
        
        // RICHMOND CITY POLICE
        try {
            console.log('📡 Fetching Richmond PD active calls...');
            const response = await fetch('https://apps.richmondgov.com/applications/ActiveCalls/getData.ashx');
            const data = await response.json();
            
            if (data && Array.isArray(data)) {
                console.log(`✅ Richmond API returned ${data.length} calls`);
                
                for (const call of data) {
                    const incident = call.type || call.CallType || '';
                    const location = call.location || call.Location || '';
                    
                    if (!incident || !location) continue;
                    
                    // Generate stable ID
                    const stableId = `rpd-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                    
                    // Geocode
                    let latitude = null, longitude = null;
                    try {
                        await new Promise(r => setTimeout(r, 100));
                        const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location + ', Richmond, Virginia')}&limit=1`, {
                            headers: { 'User-Agent': 'BPS-CAD/1.0' }
                        });
                        const geoData = await geoResp.json();
                        if (geoData[0]) {
                            latitude = parseFloat(geoData[0].lat);
                            longitude = parseFloat(geoData[0].lon);
                        }
                    } catch (e) {
                        console.error(`Geocode failed for ${location}`);
                    }
                    
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
            console.log(`✅ Richmond: Parsed ${allCalls.length} calls`);
        } catch (e) {
            errors.push(`Richmond: ${e.message}`);
            console.error(`❌ Richmond failed:`, e.message);
        }
        
        // HENRICO COUNTY POLICE
        try {
            console.log('📡 Fetching Henrico PD active calls...');
            const response = await fetch('https://webapps.co.henrico.va.us/activecalls/Default.aspx');
            const html = await response.text();
            
            const henStartCount = allCalls.length;
            
            // Extract table rows - Henrico uses class="odd" and class="even"
            const oddRows = [...html.matchAll(/<tr class="odd">(.*?)<\/tr>/gs)];
            const evenRows = [...html.matchAll(/<tr class="even">(.*?)<\/tr>/gs)];
            const allRows = [...oddRows, ...evenRows];
            
            console.log(`📋 Found ${allRows.length} Henrico rows`);
            
            for (const rowMatch of allRows) {
                const rowHtml = rowMatch[1];
                const cells = [...rowHtml.matchAll(/<td[^>]*>(.*?)<\/td>/gs)];
                
                if (cells.length >= 3) {
                    const incident = cells[1][1].replace(/<[^>]*>/g, '').trim();
                    const location = cells[2][1].replace(/<[^>]*>/g, '').trim();
                    
                    if (incident && location && incident.length > 2) {
                        const stableId = `hpd-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                        
                        let latitude = null, longitude = null;
                        try {
                            await new Promise(r => setTimeout(r, 100));
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
            console.log(`✅ Henrico: Parsed ${allCalls.length - henStartCount} calls`);
        } catch (e) {
            errors.push(`Henrico: ${e.message}`);
            console.error(`❌ Henrico failed:`, e.message);
        }
        
        // CHESTERFIELD COUNTY
        try {
            console.log('📡 Fetching Chesterfield active calls...');
            const response = await fetch('https://services7.arcgis.com/8KuaSGRhumOSMuAG/arcgis/rest/services/Public_Safety_view/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json');
            const data = await response.json();
            const ccStartCount = allCalls.length;
            
            if (data.features) {
                console.log(`📋 Found ${data.features.length} Chesterfield features`);
                
                for (const feature of data.features) {
                    const attrs = feature.attributes;
                    const incident = attrs.EventType || attrs.CallType || attrs.EVENTTYPE || '';
                    const location = attrs.Address || attrs.Location || attrs.ADDRESS || '';
                    
                    if (incident && location && incident.length > 2) {
                        const stableId = `ccpd-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                        const latitude = feature.geometry?.y ? parseFloat(feature.geometry.y) : null;
                        const longitude = feature.geometry?.x ? parseFloat(feature.geometry.x) : null;
                        
                        allCalls.push({
                            call_id: stableId,
                            incident: incident,
                            location: location,
                            agency: 'CCPD',
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
            console.log(`✅ Chesterfield: Parsed ${allCalls.length - ccStartCount} calls`);
        } catch (e) {
            errors.push(`Chesterfield: ${e.message}`);
            console.error(`❌ Chesterfield failed:`, e.message);
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
            source: 'richmond-henrico-chesterfield',
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