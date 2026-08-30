import { createClientFromRequest } from 'npm:@base44/sdk';

const normalizeRole = (value: any) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map(normalizeRole));
    const isAdmin = normalizeRole(user.role) === 'admin';
    const canManage = isAdmin || roles.has('full_access');
    if (!canManage) return Response.json({ error: 'Automatic dispatch administration access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = normalizeRole(body.action || 'list');

    if (action === 'list') {
      const rows = await base44.asServiceRole.entities.Location.list('site_name', 1000);
      const locations = (rows || []).filter((location: any) => location.active !== false && location.property_monitoring_enabled === true);
      return Response.json({ success: true, locations });
    }

    if (action === 'update_mode') {
      const id = String(body.id || '').trim();
      const mode = normalizeRole(body.mode);
      if (!id) return Response.json({ error: 'Property id is required' }, { status: 400 });
      if (!['disabled','shadow','manual_review','live'].includes(mode)) return Response.json({ error: 'Invalid automatic dispatch mode' }, { status: 400 });

      const before = await base44.asServiceRole.entities.Location.get(id);
      if (!before) return Response.json({ error: 'Property not found' }, { status: 404 });
      if (before.active === false || before.property_monitoring_enabled !== true) {
        return Response.json({ error: 'Property Monitoring must be enabled before automatic dispatch can be configured' }, { status: 400 });
      }

      const update: any = {
        auto_dispatch_enabled: mode !== 'disabled',
        auto_dispatch_mode: mode,
      };
      if (mode === 'live') {
        if (!isAdmin) return Response.json({ error: 'Primary administrator approval is required to activate LIVE automatic dispatch' }, { status: 403 });
        update.auto_dispatch_live_approved_at = new Date().toISOString();
        update.auto_dispatch_live_approved_by = user.id;
      } else {
        update.auto_dispatch_live_approved_at = null;
        update.auto_dispatch_live_approved_by = '';
      }

      await base44.asServiceRole.entities.Location.update(id, update);
      const location = await base44.asServiceRole.entities.Location.get(id);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location', entity_id: id, action: 'update', actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        before_value: JSON.stringify({ auto_dispatch_enabled: before.auto_dispatch_enabled, auto_dispatch_mode: before.auto_dispatch_mode }),
        after_value: JSON.stringify({ auto_dispatch_enabled: location.auto_dispatch_enabled, auto_dispatch_mode: location.auto_dispatch_mode }),
        field_changed: 'auto_dispatch_enabled,auto_dispatch_mode', timestamp: new Date().toISOString(),
        description: `Automatic dispatch mode changed to ${mode}.`,
      }).catch(() => null);
      return Response.json({ success: true, location });
    }

    if (action === 'update_settings') {
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'Property id is required' }, { status: 400 });
      const before = await base44.asServiceRole.entities.Location.get(id);
      if (!before) return Response.json({ error: 'Property not found' }, { status: 404 });

      const settings = body.settings || {};
      const update: any = {
        auto_dispatch_response_radius_miles: Math.max(0.1, Number(settings.auto_dispatch_response_radius_miles ?? before.auto_dispatch_response_radius_miles ?? 5)),
        auto_dispatch_required_units: Math.max(1, Math.floor(Number(settings.auto_dispatch_required_units ?? before.auto_dispatch_required_units ?? 1))),
        auto_dispatch_backup_required: settings.auto_dispatch_backup_required === true,
        auto_dispatch_acknowledgement_seconds: Math.max(30, Math.floor(Number(settings.auto_dispatch_acknowledgement_seconds ?? before.auto_dispatch_acknowledgement_seconds ?? 120))),
        auto_dispatch_escalation_seconds: Math.max(60, Math.floor(Number(settings.auto_dispatch_escalation_seconds ?? before.auto_dispatch_escalation_seconds ?? 300))),
        auto_dispatch_recheck_seconds: Math.max(30, Math.floor(Number(settings.auto_dispatch_recheck_seconds ?? before.auto_dispatch_recheck_seconds ?? 60))),
        auto_dispatch_required_qualifications: Array.isArray(settings.auto_dispatch_required_qualifications) ? settings.auto_dispatch_required_qualifications.filter(Boolean) : (before.auto_dispatch_required_qualifications || []),
        auto_dispatch_required_equipment: Array.isArray(settings.auto_dispatch_required_equipment) ? settings.auto_dispatch_required_equipment.filter(Boolean) : (before.auto_dispatch_required_equipment || []),
        auto_dispatch_required_ranks: Array.isArray(settings.auto_dispatch_required_ranks) ? settings.auto_dispatch_required_ranks.filter(Boolean) : (before.auto_dispatch_required_ranks || []),
        property_safety_warnings: String(settings.property_safety_warnings ?? before.property_safety_warnings ?? '').slice(0, 2000),
        property_access_instructions: String(settings.property_access_instructions ?? before.property_access_instructions ?? '').slice(0, 2000),
      };

      await base44.asServiceRole.entities.Location.update(id, update);
      const location = await base44.asServiceRole.entities.Location.get(id);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location', entity_id: id, action: 'update', actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        before_value: JSON.stringify(Object.fromEntries(Object.keys(update).map(key => [key, before?.[key]]))),
        after_value: JSON.stringify(Object.fromEntries(Object.keys(update).map(key => [key, location?.[key]]))),
        field_changed: Object.keys(update).join(',').slice(0, 500), timestamp: new Date().toISOString(),
        description: 'Automatic dispatch operating settings updated.',
      }).catch(() => null);
      return Response.json({ success: true, location });
    }

    return Response.json({ error: 'Unsupported automatic dispatch action' }, { status: 400 });
  } catch (error) {
    console.error('manageAutoDispatchConfig failed', error);
    return Response.json({ error: error?.message || 'Unable to manage automatic dispatch configuration' }, { status: 500 });
  }
});