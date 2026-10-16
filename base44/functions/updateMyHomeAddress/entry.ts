import { createClientFromRequest } from 'npm:@base44/sdk';

const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const resolveProfile = async () => {
      const direct = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
      if (direct && String(direct.email || '').toLowerCase() === String(user.email || '').toLowerCase()) return direct;
      const rows = await base44.asServiceRole.entities.User.filter({ email: user.email }, '-updated_date', 1).catch(() => []);
      return rows?.[0] || null;
    };

    if (String(body.action || '').toLowerCase() === 'get') {
      const profile = await resolveProfile();
      return Response.json({
        success: true,
        address: clean(profile?.address, 160),
        city: clean(profile?.city, 80),
        state: clean(profile?.state, 2).toUpperCase(),
        zip: clean(profile?.zip, 12),
      });
    }

    const address = clean(body.address, 160);
    const city = clean(body.city, 80);
    const state = clean(body.state, 2).toUpperCase();
    const zip = clean(body.zip, 12);

    if (!address) return Response.json({ error: 'Street address is required' }, { status: 400 });
    if (!city) return Response.json({ error: 'City is required' }, { status: 400 });
    if (!state) return Response.json({ error: 'State is required' }, { status: 400 });
    if (!zip) return Response.json({ error: 'ZIP code is required' }, { status: 400 });

    // Self-service only: the authenticated user's id is the only update target.
    const profile = await resolveProfile();
    if (!profile?.id) return Response.json({ error: 'Unable to locate your officer profile.' }, { status: 404 });
    await base44.asServiceRole.entities.User.update(profile.id, { address, city, state, zip });
    const verified = await base44.asServiceRole.entities.User.get(profile.id);
    if ([['address',address],['city',city],['state',state],['zip',zip]].some(([key,value]) => String(verified?.[key] || '').trim() !== value)) throw new Error('Address could not be verified after saving. Please retry.');

    return Response.json({
      success: true,
      address,
      city,
      state,
      zip,
    });
  } catch (error: any) {
    console.error('updateMyHomeAddress failed', error);
    return Response.json({ error: error?.message || 'Unable to update Home address' }, { status: 500 });
  }
});
