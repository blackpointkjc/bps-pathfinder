import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BRIDGE_URL = 'https://bpsc.base44.app/api/functions/linkedAppBridge';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const reportData = await req.json();

        // Format array data as strings for linked app
        const formatPersonArray = (people) => {
            return people.map(p => {
                const parts = [p.name];
                if (p.dob) parts.push(`DOB: ${p.dob}`);
                if (p.dl_number) parts.push(`DL: ${p.dl_number}`);
                if (p.dl_state) parts.push(p.dl_state);
                if (p.ssn) parts.push(`SSN: ${p.ssn}`);
                return parts.filter(Boolean).join(' | ');
            }).join('\n');
        };

        const formatVehicleArray = (vehicles) => {
            return vehicles.map(v => {
                const parts = [];
                if (v.year || v.make || v.model) {
                    parts.push([v.year, v.make, v.model].filter(Boolean).join(' '));
                }
                if (v.color) parts.push(v.color);
                if (v.plate) parts.push(`Plate: ${v.plate}`);
                if (v.state) parts.push(v.state);
                return parts.filter(Boolean).join(' | ');
            }).join('\n');
        };

        const formattedData = {
            ...reportData,
            victims: formatPersonArray(reportData.victims || []),
            witnesses: formatPersonArray(reportData.witnesses || []),
            suspects: formatPersonArray(reportData.suspects || []),
            suspect_vehicles: formatVehicleArray(reportData.suspect_vehicles || [])
        };

        // Send complete report to linked app
        const res = await fetch(BRIDGE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': Deno.env.get('LINKED_APP_API_KEY')
            },
            body: JSON.stringify({ 
                action: 'create',
                entity: 'IncidentReport',
                data: formattedData
            })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to send report to linked app');

        return Response.json({ success: true, result });
    } catch (error) {
        console.error('Error sending report:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});