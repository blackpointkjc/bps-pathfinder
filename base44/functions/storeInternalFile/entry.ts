import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const dataUrl = String(body.data_url || '');
    const name = String(body.name || 'attachment').slice(0, 180);
    if (!dataUrl.startsWith('data:')) return Response.json({ error: 'A valid internal file payload is required' }, { status: 400 });
    if (dataUrl.length > 7_500_000) return Response.json({ error: 'Internal files must be under approximately 5 MB' }, { status: 413 });
    return Response.json({ success: true, file_url: dataUrl, url: dataUrl, name, storage: 'pathfinder_inline', credit_free: true });
  } catch (error) {
    console.error('storeInternalFile failed', error);
    return Response.json({ error: error?.message || 'Unable to store internal file' }, { status: 500 });
  }
});