import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BRIDGE_URL = 'https://bpsc.base44.app/api/functions/linkedAppBridge';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { action, entity, entityId, data, query } = body;

        if (action === 'search') {
            const res = await fetch(BRIDGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'search', query: query || '' })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Bridge search failed');
            return Response.json(result);
        }

        if (action === 'update') {
            if (!entity || !entityId || !data) return Response.json({ error: 'Missing entity, entityId, or data' }, { status: 400 });
            const res = await fetch(BRIDGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update', entity, entityId, data })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Bridge update failed');
            return Response.json({ success: true, result });
        }

        if (action === 'create') {
            if (!entity || !data) return Response.json({ error: 'Missing entity or data' }, { status: 400 });
            const res = await fetch(BRIDGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', entity, data })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Bridge create failed');
            return Response.json({ success: true, result });
        }

        return Response.json({ error: 'Unknown action. Use: search, update, create' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});