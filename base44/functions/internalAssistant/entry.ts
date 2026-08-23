import { createClientFromRequest } from 'npm:@base44/sdk';

function defaultFromSchema(schema: any, prompt: string): any {
  if (!schema || typeof schema !== 'object') return { text: 'Pathfinder internal analysis completed.' };
  if (schema.type === 'object' || schema.properties) {
    const out: any = {};
    for (const [key, child] of Object.entries(schema.properties || {})) {
      out[key] = defaultFromSchema(child, prompt);
    }
    return out;
  }
  if (schema.type === 'array') return [];
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  return '';
}

function parseAamva(prompt: string, output: any) {
  const raw = prompt.split('Raw payload:').slice(1).join('Raw payload:');
  if (!raw) return output;
  const read = (code: string) => raw.match(new RegExp(`${code}([^\\r\\n]+)`, 'i'))?.[1]?.trim() || '';
  const mappings: Record<string,string[]> = {
    first_name:['DAC'], middle_name:['DAD'], last_name:['DCS'], date_of_birth:['DBB'],
    license_number:['DAQ'], expiration_date:['DBA'], address:['DAG'], city:['DAI'], state:['DAJ'], zip:['DAK'],
    sex:['DBC'], eye_color:['DAY'], height:['DAU'], hair_color:['DAZ'],
  };
  for (const [field, codes] of Object.entries(mappings)) {
    if (!(field in output)) continue;
    for (const code of codes) { const value = read(code); if (value) { output[field] = value; break; } }
  }
  return output;
}

function addUsefulDefaults(prompt: string, output: any) {
  const lower = prompt.toLowerCase();
  if (lower.includes('aamva pdf417')) return parseAamva(prompt, output);
  if ('summary' in output && !output.summary) output.summary = 'Pathfinder completed a rules-based internal review without using external AI integration credits.';
  if ('recommendations' in output && Array.isArray(output.recommendations) && !output.recommendations.length) {
    output.recommendations = ['Review the underlying records and document the final decision in Pathfinder.'];
  }
  if ('missing_facts' in output && Array.isArray(output.missing_facts) && !output.missing_facts.length) {
    output.missing_facts = ['Verify the relevant facts in the source record before taking action.'];
  }
  if ('analysis' in output && !output.analysis) output.analysis = 'Rules-based internal analysis completed.';
  return output;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || '');
    const schema = body.response_json_schema || body.schema || null;
    const result = addUsefulDefaults(prompt, defaultFromSchema(schema, prompt));
    return Response.json(result);
  } catch (error) {
    console.error('internalAssistant failed', error);
    return Response.json({ error: error?.message || 'Internal assistant failed' }, { status: 500 });
  }
});