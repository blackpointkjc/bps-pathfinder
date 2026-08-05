import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Calculate distance between two coordinates in meters using Haversine formula
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Simple geocoding using Nominatim (free OpenStreetMap service)
async function geocodeAddress(address) {
  try {
    // Clean address - remove block numbers and suffixes
    let cleanAddress = address
      .replace(/Block\s*/gi, '')
      .replace(/-HENRICO|-CHESTERFIELD|-RICHMOND/gi, '')
      .trim();
    
    const searchAddress = encodeURIComponent(cleanAddress + ', Richmond, VA');
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${searchAddress}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'VirtusConnect Security App'
        }
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
  } catch (e) {
    console.error('Geocoding error:', e);
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Fetch all active locations with coordinates
    const locations = await base44.asServiceRole.entities.Location.list();
    const locationsWithCoords = locations.filter(loc => 
      loc.active && loc.latitude && loc.longitude
    );

    if (locationsWithCoords.length === 0) {
      return Response.json({ calls: [], message: 'No locations with coordinates found' });
    }

    // Fetch active calls from gractivecalls.com
    const callsResponse = await fetch('https://gractivecalls.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    const html = await callsResponse.text();
    
    // Parse the HTML to extract call data from the table
    const calls = [];
    
    // Look for table cells with date pattern followed by incident data
    // The table structure is: Time | Incident | Location | Agency | Status
    const tdPattern = /<td[^>]*class="[^"]*mantine-Table-td[^"]*"[^>]*>([^<]*)<\/td>/gi;
    const allTds = [];
    let tdMatch;
    
    while ((tdMatch = tdPattern.exec(html)) !== null) {
      const content = tdMatch[1].trim();
      if (content && !content.includes('mantine') && content.length > 0) {
        allTds.push(content);
      }
    }
    
    // Process TDs in groups of 5 (time, incident, location, agency, status)
    for (let i = 0; i < allTds.length - 4; i++) {
      const timeReceived = allTds[i];
      // Check if this looks like a date/time
      if (/\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M/i.test(timeReceived)) {
        calls.push({
          time_received: timeReceived,
          incident_type: allTds[i + 1],
          address: allTds[i + 2],
          agency: allTds[i + 3],
          status: allTds[i + 4]
        });
        i += 4; // Skip to next row
      }
    }

    // Check proximity to our locations and create calls for nearby incidents
    const nearbyCallsToCreate = [];
    const MAX_RADIUS_METERS = 402; // 0.25 miles = 402 meters - STRICT LIMIT

    // Only process first 20 calls to avoid timeout
    const callsToProcess = calls.slice(0, 20);

    for (const call of callsToProcess) {
      // Try to geocode the call address
      const callCoords = await geocodeAddress(call.address);
      
      if (callCoords) {
        // Check distance to each location
        const affectedSites = [];
        
        for (const loc of locationsWithCoords) {
          const distance = getDistanceInMeters(
            callCoords.lat, callCoords.lon,
            loc.latitude, loc.longitude
          );
          
          // STRICT: Only use each location's specific geofence radius (DO NOT default to 402m)
          const allowedRadius = loc.geofence_radius_meters || 161; // Default to 0.10 miles if not set
          
          if (distance <= allowedRadius) {
            affectedSites.push(loc.site_name);
            console.log(`Call at ${call.address} is ${Math.round(distance)}m from ${loc.site_name} (within ${allowedRadius}m)`);
          } else {
            console.log(`Call at ${call.address} is ${Math.round(distance)}m from ${loc.site_name} (TOO FAR - limit ${allowedRadius}m)`);
          }
        }

        if (affectedSites.length > 0) {
          nearbyCallsToCreate.push({
            call_time: new Date().toISOString(),
            incident_type: call.incident_type,
            address: call.address,
            affected_sites: affectedSites,
            latitude: callCoords.lat,
            longitude: callCoords.lon,
            details: `Agency: ${call.agency} | Status: ${call.status} | Time: ${call.time_received}`,
            acknowledged: false
          });
        }
      }

      // Rate limit geocoding requests (Nominatim requires 1 req/sec)
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    // Check for existing calls to avoid duplicates (by address within last 2 hours)
    const existingCalls = await base44.asServiceRole.entities.CallForService.list('-call_time');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    const recentAddresses = new Set(
      existingCalls
        .filter(c => new Date(c.call_time) > twoHoursAgo)
        .map(c => c.address?.toLowerCase())
    );

    // Create new calls that don't already exist
    const newCalls = nearbyCallsToCreate.filter(
      call => !recentAddresses.has(call.address?.toLowerCase())
    );

    for (const call of newCalls) {
      await base44.asServiceRole.entities.CallForService.create(call);
    }

    return Response.json({ 
      success: true,
      totalCallsFound: calls.length,
      callsProcessed: callsToProcess.length,
      nearbyCallsFound: nearbyCallsToCreate.length,
      newCallsCreated: newCalls.length,
      calls: newCalls,
      debug: calls.slice(0, 3) // Return first 3 for debugging
    });

  } catch (error) {
    console.error('Error fetching active calls:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});