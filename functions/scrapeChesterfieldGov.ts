import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🔍 Starting Chesterfield Gov scraper...');
        
        // Fetch the Chesterfield gov page
        const response = await fetch('https://www.chesterfield.gov/3999/Active-Police-Calls', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(15000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        console.log(`📄 Received HTML: ${html.length} chars`);
        
        // Use AI to extract call data from the HTML
        const extractedData = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Extract all active police calls from this HTML page.
            
HTML content:
${html.substring(0, 50000)}

Return a JSON array of calls with this exact structure:
{
  "calls": [
    {
      "incident": "incident type",
      "location": "full address",
      "time": "time received",
      "status": "call status"
    }
  ]
}

Extract ALL calls you can find. If there are no calls or the page format is different, return {"calls": []}.
Only return valid JSON, no explanations.`,
            response_json_schema: {
                type: "object",
                properties: {
                    calls: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                incident: { type: "string" },
                                location: { type: "string" },
                                time: { type: "string" },
                                status: { type: "string" }
                            }
                        }
                    }
                }
            }
        });
        
        const extractedCalls = extractedData?.calls || [];
        console.log(`🤖 AI extracted ${extractedCalls.length} calls`);
        
        // Delete existing Chesterfield gov calls
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'chesterfield_gov' });
        for (const call of existingCalls) {
            await base44.asServiceRole.entities.DispatchCall.delete(call.id);
        }
        console.log(`🗑️ Deleted ${existingCalls.length} old Chesterfield gov calls`);
        
        // Geocode and save new calls
        let saved = 0;
        let geocoded = 0;
        
        for (const call of extractedCalls) {
            try {
                if (!call.incident || !call.location) continue;
                
                const callId = `chesterfield_gov-${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 150);
                
                // Geocode the address
                let latitude = null;
                let longitude = null;
                
                try {
                    const normalizedLocation = `${call.location}, Chesterfield County, VA`;
                    const geoResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedLocation)}&limit=1`,
                        {
                            headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' },
                            signal: AbortSignal.timeout(5000)
                        }
                    );
                    
                    if (geoResponse.ok) {
                        const geoData = await geoResponse.json();
                        if (geoData && geoData.length > 0) {
                            latitude = parseFloat(geoData[0].lat);
                            longitude = parseFloat(geoData[0].lon);
                            geocoded++;
                            console.log(`✅ Geocoded: ${call.location} → ${latitude}, ${longitude}`);
                        }
                    }
                } catch (geoError) {
                    console.warn(`⚠️ Geocoding failed for ${call.location}`);
                }
                
                // Parse time
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
                        
                        if (timeReceived > new Date()) {
                            timeReceived.setDate(timeReceived.getDate() - 1);
                        }
                    }
                }
                
                // Save call
                await base44.asServiceRole.entities.DispatchCall.create({
                    call_id: callId,
                    incident: call.incident,
                    location: call.location,
                    agency: 'CCPD',
                    status: call.status || 'Active',
                    latitude: latitude,
                    longitude: longitude,
                    time_received: timeReceived.toISOString(),
                    description: `${call.incident} at ${call.location}`,
                    source: 'chesterfield_gov'
                });
                saved++;
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ Error processing call:`, error.message);
            }
        }
        
        console.log(`💾 Chesterfield Gov: Saved ${saved} calls, Geocoded ${geocoded}`);
        
        return Response.json({ 
            success: true,
            extracted: extractedCalls.length,
            saved,
            geocoded
        });
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});