import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SYSTEM_PROMPT = `You are a 911 dispatch priority classifier. Given a list of incident call types, classify each one using the following priority rules:

PRIORITY 1 = CRITICAL: Calls involving ARMED, ASSAULT, UNCONSCIOUS, DOMESTIC ACTIVE, FIRE, active violence, weapons, serious injury, or imminent danger.
PRIORITY 2 = URGENT: Calls involving BURGLARY, RECKLESS driving, SUSPICIOUS person/vehicle, TROUBLE UNKNOWN, ACCIDENT, fight, threats, or possible active crimes.
PRIORITY 3 = MODERATE: Calls involving LARCENY, SHOPLIFTING, TRESPASS, DISORDERLY, noise complaints, or minor disturbances.
PRIORITY 4 = LOW: Calls involving PARKING, ASSIST, ANIMAL, PUBLIC SERVICE, welfare checks with no danger, or administrative requests.

Rules:
- Use semantic understanding, not just keyword matching.
- If unclear, default to PRIORITY 3 MODERATE unless wording strongly suggests danger.
- For each call type, choose the closest matching normalized category.
- Keep priority_reason short (1 sentence).

Return a JSON array with one object per call in the same order as input.`;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { calls } = await req.json();

        if (!calls || calls.length === 0) {
            return Response.json({ results: [] });
        }

        const callList = calls.map((c, i) => `${i + 1}. "${c.incident}"`).join('\n');

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `${SYSTEM_PROMPT}\n\nClassify these ${calls.length} incident call types:\n${callList}`,
            response_json_schema: {
                type: 'object',
                properties: {
                    results: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                priority_level: { type: 'number' },
                                priority_label: { type: 'string', enum: ['CRITICAL', 'URGENT', 'MODERATE', 'LOW'] },
                                ai_call_category: { type: 'string' },
                                priority_reason: { type: 'string' }
                            },
                            required: ['priority_level', 'priority_label', 'ai_call_category', 'priority_reason']
                        }
                    }
                },
                required: ['results']
            }
        });

        return Response.json({ results: result.results || [] });
    } catch (error) {
        console.error('Classification failed:', error);
        return Response.json({ error: error.message, results: [] }, { status: 500 });
    }
});