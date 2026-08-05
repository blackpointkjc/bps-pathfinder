import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((r: unknown) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('officer') || roles.has('supervisor') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Officer access required' }, { status: 403 });

    const { fields } = await req.json();
    if (!Array.isArray(fields) || fields.length === 0) {
      return Response.json({ error: 'Narrative fields are required' }, { status: 400 });
    }

    const cleanFields = fields
      .filter((f: any) => typeof f?.text === 'string' && f.text.trim().length >= 3)
      .slice(0, 30)
      .map((f: any, index: number) => ({ index: Number.isFinite(f.index) ? f.index : index, field: String(f.field || `field_${index}`), text: f.text.trim() }));

    if (!cleanFields.length) return Response.json({ error: 'Add report details before review' }, { status: 400 });

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Rewrite the following security officer report narrative fields for grammar, clarity, chronological organization, objective professional tone, and educated wording. Preserve every fact and the original meaning. Do not invent facts, names, evidence, actions, legal conclusions, or outcomes. Do not remove important details. Return only JSON matching the schema.\n\n${JSON.stringify(cleanFields)}`,
      response_json_schema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number' },
                text: { type: 'string' },
              },
              required: ['index', 'text'],
            },
          },
        },
        required: ['fields'],
      },
    });

    const output = result?.fields || result?.data?.fields || [];
    return Response.json({ success: true, fields: output });
  } catch (error) {
    console.error('professionalizeReport failed', error);
    return Response.json({ error: error?.message || 'Unable to review report' }, { status: 500 });
  }
});