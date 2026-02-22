import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BRIDGE_URL = 'https://bpsc.base44.app/api/functions/linkedAppBridge';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const reportData = await req.json();

        // Send full report to linked app
        const res = await fetch(BRIDGE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': Deno.env.get('LINKED_APP_API_KEY')
            },
            body: JSON.stringify({
                action: 'sendReport',
                reportData: reportData
            })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to send report');

        return Response.json({ success: true, result });
    } catch (error) {
        console.error('Error sending report:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});