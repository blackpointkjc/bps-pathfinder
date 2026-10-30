import { createClientFromRequest } from 'npm:@base44/sdk';

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

    // Sentence-case clean-up for narrative text, without rewriting names,
    // vehicle plates, acronyms or other reported facts. Preserve hard line
    // breaks, bullet structure and paragraph spacing. Do not lowercase words:
    // proper nouns and agency abbreviations must retain their original case.
    const professionalizeParagraph = (value: string) => {
      const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n');
      return lines.map(raw=>{
        const line=raw.replace(/[ \t]+/g,' ').trim();
        if(!line)return '';
        const bullet=/^(?:[-*•]|\d+[.)])\s+/.test(line);
        // Only a standalone first-person pronoun receives forced uppercase.
        let formatted=line.replace(/\bi\b/g,'I');
        formatted=formatted.replace(/(^|[.!?]\s+|[:;]\s+)([a-z])/g,
          (_m,separator:string,letter:string)=>separator+letter.toUpperCase());
        // Preserve abbreviations and report references; capitalize the first
        // alphabetic character after an optional bullet/number prefix.
        if(bullet)formatted=formatted.replace(/^((?:[-*•]|\d+[.)])\s+)([a-z])/,
          (_m,prefix:string,letter:string)=>prefix+letter.toUpperCase());
        else formatted=formatted.replace(/^([a-z])/,letter=>letter.toUpperCase());
        if(!bullet&&/[\p{L}\p{N}]$/u.test(formatted))formatted+='.';
        return formatted;
      }).join('\n').trim();
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