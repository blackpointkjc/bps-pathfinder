import { createClientFromRequest } from 'npm:@base44/sdk';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    shifts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          officer_email: { type: 'string' },
          officer_name_from_pdf: { type: 'string' },
          shift_date: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          location: { type: 'string' },
          site_details: { type: 'string' },
          special_instructions: { type: 'string' },
          is_open: { type: 'boolean' },
          is_split_shift: { type: 'boolean' },
        },
        required: ['officer_email', 'shift_date', 'start_time', 'end_time', 'location'],
      },
    },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['shifts', 'issues'],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ error: 'Admin access is required to import a schedule.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const fileUrl = String(body.file_url || '');
    const officers = Array.isArray(body.officers) ? body.officers.slice(0, 2000) : [];
    const locations = Array.isArray(body.locations) ? body.locations.slice(0, 2000) : [];

    if (!fileUrl.startsWith('data:application/pdf')) {
      return Response.json({ error: 'A valid PDF file is required.' }, { status: 400 });
    }
    if (fileUrl.length > 7_500_000) {
      return Response.json({ error: 'The PDF must be smaller than 5 MB.' }, { status: 413 });
    }
    if (!officers.length) {
      return Response.json({ error: 'The active officer directory is empty.' }, { status: 400 });
    }

    const prompt = `Extract every work shift from the attached PDF exactly as displayed.

Match each named officer to ONE entry in the supplied officer directory and return that entry's exact email. Use "OPEN" only when the PDF explicitly shows an open or unassigned shift. Never invent an officer, email, date, time, or location.

Normalize dates to YYYY-MM-DD and times to 24-hour HH:mm. For an overnight shift, keep the date on which the shift starts and set is_split_shift=true. Use the closest exact location from the location directory when the wording clearly matches; otherwise preserve the PDF's location text and explain it in issues. Put anything ambiguous, unreadable, unmatched, or omitted into issues instead of guessing.

OFFICER DIRECTORY:
${JSON.stringify(officers)}

LOCATION DIRECTORY:
${JSON.stringify(locations)}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [fileUrl],
      response_json_schema: RESPONSE_SCHEMA,
    });

    return Response.json({
      shifts: Array.isArray(result?.shifts) ? result.shifts : [],
      issues: Array.isArray(result?.issues) ? result.issues : [],
    });
  } catch (error) {
    console.error('parseSchedulePdf failed', error);
    return Response.json({ error: error?.message || 'Unable to extract the schedule PDF.' }, { status: 500 });
  }
});
