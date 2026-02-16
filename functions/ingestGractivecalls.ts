import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting active calls ingestion...');
        
        // TEMPORARY: Generate test data until we fix the API connections
        const testCalls = [
            { incident: 'TRAFFIC ACCIDENT', location: '5000 W BROAD ST', agency: 'RPD', lat: 37.5926, lon: -77.4886 },
            { incident: 'SUSPICIOUS PERSON', location: '3000 N BOULEVARD', agency: 'RPD', lat: 37.5755, lon: -77.4553 },
            { incident: 'ALARM ACTIVATION', location: '1000 CANAL ST', agency: 'RPD', lat: 37.5368, lon: -77.4275 },
            { incident: 'DOMESTIC DISTURBANCE', location: '2000 CHAMBERLAYNE AVE', agency: 'RPD', lat: 37.5689, lon: -77.4252 },
            { incident: 'MEDICAL EMERGENCY', location: '1600 W LEIGH ST', agency: 'RPD', lat: 37.5562, lon: -77.4485 },
            { incident: 'VEHICLE THEFT', location: '3600 PATTERSON AVE', agency: 'HPD', lat: 37.5733, lon: -77.5106 },
            { incident: 'BURGLARY IN PROGRESS', location: '4000 PARHAM RD', agency: 'HPD', lat: 37.6189, lon: -77.5339 },
            { incident: 'ASSAULT', location: '9000 STAPLES MILL RD', agency: 'HPD', lat: 37.6303, lon: -77.4984 },
            { incident: 'LARCENY', location: '7000 FOREST AVE', agency: 'HPD', lat: 37.5905, lon: -77.5162 },
            { incident: 'TRAFFIC STOP', location: '12000 IRON BRIDGE RD', agency: 'CCPD', lat: 37.4129, lon: -77.5636 },
            { incident: 'SUSPICIOUS VEHICLE', location: '15000 HULL STREET RD', agency: 'CCPD', lat: 37.3898, lon: -77.5854 },
            { incident: 'WELFARE CHECK', location: '13000 MIDLOTHIAN TPKE', agency: 'CCPD', lat: 37.4521, lon: -77.6279 },
            { incident: 'TRESPASSING', location: '6000 HOPKINS RD', agency: 'CCPD', lat: 37.3456, lon: -77.5112 }
        ];
        
        const allCalls = [];
        
        for (const call of testCalls) {
            const stableId = `${call.agency.toLowerCase()}-${call.location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
            
            allCalls.push({
                call_id: stableId,
                incident: call.incident,
                location: call.location,
                agency: call.agency,
                status: 'Active',
                priority: 'medium',
                time_received: new Date().toISOString(),
                latitude: call.lat,
                longitude: call.lon,
                source: 'gractivecalls',
                description: `${call.incident} at ${call.location}`
            });
        }
        
        console.log(`✅ Generated ${allCalls.length} test calls`);
        console.log(`📍 All calls have geocoded coordinates`);
        
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
                    console.log(`  🔄 Updated: ${callData.call_id}`);
                } else {
                    await base44.asServiceRole.entities.DispatchCall.create(callData);
                    inserted++;
                    console.log(`  ➕ Created: ${callData.call_id}`);
                }
            } catch (e) {
                console.error(`  ❌ Failed ${callData.call_id}: ${e.message}`);
            }
        }
        
        // Delete stale calls
        const newCallIds = new Set(allCalls.map(c => c.call_id));
        let deleted = 0;
        for (const existing of existingCalls) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
                console.log(`  🗑️ Deleted stale: ${existing.call_id}`);
            }
        }
        
        console.log(`💾 Database: ${inserted} created, ${updated} updated, ${deleted} deleted`);
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'test-data',
            total_parsed: allCalls.length,
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            geocoded: allCalls.length
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