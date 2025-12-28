Deno.serve(async (req) => {
    try {
        const stations = [
            // Henrico
            { name: 'West Station (Headquarters)', address: '7721 E. Parham Rd., Henrico, VA 23294', county: 'henrico' },
            { name: 'Central Station', address: '7850 Villa Park Drive, Henrico, VA 23228', county: 'henrico' },
            { name: 'South Station', address: '640 N. Airport Drive, Henrico, VA 23075', county: 'henrico' },
            // Chesterfield
            { name: 'Police Department Headquarters', address: '10001 Iron Bridge Road, Chesterfield, VA 23832', county: 'chesterfield' },
            { name: 'Appomattox Police Station', address: '2920 W Hundred Road, Chester, VA 23831', county: 'chesterfield' },
            { name: 'Falling Creek Police Station', address: '20 N Providence Road, North Chesterfield, VA 23235', county: 'chesterfield' },
            { name: 'Hicks Road Police Station', address: '2730 Hicks Road, North Chesterfield, VA 23235', county: 'chesterfield' },
            { name: 'Swift Creek Police Station', address: '6812 Woodlake Commons Loop, Midlothian, VA 23112', county: 'chesterfield' }
        ];

        const geocodedStations = [];

        for (const station of stations) {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(station.address)}&limit=1`,
                {
                    headers: {
                        'User-Agent': 'Base44-PoliceStationGeocoder/1.0'
                    }
                }
            );
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                geocodedStations.push({
                    name: station.name,
                    address: station.address,
                    county: station.county,
                    coords: [parseFloat(data[0].lat), parseFloat(data[0].lon)]
                });
            } else {
                geocodedStations.push({
                    name: station.name,
                    address: station.address,
                    county: station.county,
                    coords: null,
                    error: 'Address not found'
                });
            }
            
            // Add delay to respect rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return Response.json({ success: true, stations: geocodedStations });
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});