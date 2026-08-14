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

    // Credit-free deterministic professionalization. The previous InvokeLLM call
    // spent integration credits on every report review; this rule-based pass
    // cleans casing, spacing, sentence punctuation, and standalone "I" without
    // an LLM and never invents or omits facts. The response contract is unchanged.
    const professionalizeParagraph = (text: string) => {
      const clean = String(text || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\b[iI]\b/g, 'I')
        .replace(/([.!?])\s*/g, '$1 ')
        .replace(/(^|[.!?]\s+)([a-z])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase())
        .trim();
      return clean && !/[.!?]$/.test(clean) ? `${clean}.` : clean;
    };

    const output = cleanFields.map((f: any) => ({
      index: f.index,
      text: String(f.text || '')
        .split(/\n{2,}/)
        .map((para: string) => professionalizeParagraph(para))
        .filter(Boolean)
        .join('\n\n'),
    }));
    return Response.json({ success: true, fields: output });
  } catch (error) {
    console.error('professionalizeReport failed', error);
    return Response.json({ error: error?.message || 'Unable to review report' }, { status: 500 });
  }
});