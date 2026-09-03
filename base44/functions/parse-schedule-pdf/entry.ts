import { createClientFromRequest } from 'npm:@base44/sdk';

type Matrix = [number, number, number, number, number, number];
type Box = { x: number; y: number; width: number; height: number };
type TextItem = Box & { text: string };
type Officer = { email?: string; name?: string; rank?: string; unit_number?: string };
type Site = { site_name?: string; address?: string };

const normalized = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const multiply = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];
const point = (matrix: Matrix, x: number, y: number) => ({
  x: matrix[0] * x + matrix[2] * y + matrix[4],
  y: matrix[1] * x + matrix[3] * y + matrix[5],
});
const pad = (value: number) => String(value).padStart(2, '0');
const timeText = (minutes: number) => {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
};
const addDays = (date: string, amount: number) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
};
const closestYearDate = (month: number, day: number, anchor = new Date()) => {
  const candidates = [anchor.getUTCFullYear() - 1, anchor.getUTCFullYear(), anchor.getUTCFullYear() + 1]
    .map(year => ({ year, distance: Math.abs(Date.UTC(year, month - 1, day) - anchor.getTime()) }))
    .sort((a, b) => a.distance - b.distance);
  return `${candidates[0].year}-${pad(month)}-${pad(day)}`;
};
const uniqueBoxes = (boxes: Box[]) => {
  const seen = new Set<string>();
  return boxes.filter(box => {
    const key = [box.x, box.y, box.width, box.height].map(value => Math.round(value * 10)).join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const matchOfficer = (label: string, officers: Officer[]) => {
  const target = normalized(label);
  const reversed = normalized(label.split(',').reverse().join(' '));
  const scored = officers.map(officer => {
    const name = normalized(officer.name);
    if (!name) return { officer, score: 0 };
    if (name === target || name === reversed) return { officer, score: 100 };
    const targetParts = new Set((reversed || target).split(' ').filter(Boolean));
    const nameParts = name.split(' ').filter(Boolean);
    const overlap = nameParts.filter(part => targetParts.has(part)).length;
    return { officer, score: overlap * 10 - Math.abs(nameParts.length - targetParts.size) };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 10 ? scored[0].officer : null;
};
const siteWords = (value: unknown) => normalized(value)
  .split(' ')
  .filter(word => word.length > 1 && !['the', 'at', 'of', 'site', 'sites'].includes(word));

const matchLocation = (eventText: string, locations: Site[]) => {
  const siteMatch = eventText.match(/Sites?\s*:\s*([\s\S]*?)(?:Officers?\s*:|$)/i);
  const printedSite = String(siteMatch?.[1] || '').replace(/\s+/g, ' ').trim();
  if (!printedSite) return { site_name: '', printed_site: '', score: 0 };

  const printedNormalized = normalized(printedSite);
  const printedWords = new Set(siteWords(printedSite));
  const ranked = locations.map(site => {
    const canonical = String(site?.site_name || '').trim();
    const canonicalNormalized = normalized(canonical);
    const canonicalWords = siteWords(canonical);
    const overlap = canonicalWords.filter(word => printedWords.has(word)).length;
    const union = new Set([...canonicalWords, ...printedWords]).size || 1;
    let score = overlap / union;
    if (canonicalNormalized === printedNormalized) score = 10;
    else if (canonicalNormalized.includes(printedNormalized) || printedNormalized.includes(canonicalNormalized)) score += 2;
    return { site_name: canonical, printed_site: printedSite, score };
  }).filter(item => item.site_name).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return best && (best.score >= 0.45 || best.score >= 2)
    ? best
    : { site_name: '', printed_site: printedSite, score: best?.score || 0 };
};

const officersInEvent = (eventText: string, resourceLabel: string, officers: Officer[]) => {
  const officerSection = eventText.match(/Officers?\s*:\s*([\s\S]*)$/i)?.[1] || '';
  const haystack = normalized(officerSection);
  const found = officers.filter(officer => {
    const name = String(officer.name || '');
    const forward = normalized(name);
    const reversed = normalized(name.split(' ').reverse().join(' '));
    return !!forward && (haystack.includes(forward) || haystack.includes(reversed));
  });
  const resourceOfficer = matchOfficer(resourceLabel, officers);
  if (resourceOfficer?.email && !found.some(officer => normalized(officer.email) === normalized(resourceOfficer.email))) {
    found.push(resourceOfficer);
  }
  return found.filter((officer, index, rows) =>
    officer?.email && rows.findIndex(item => normalized(item.email) === normalized(officer.email)) === index
  );
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userRoles = new Set([
      normalized(user.role),
      ...(Array.isArray(user.additional_roles) ? user.additional_roles.map(normalized) : []),
    ]);
    if (!userRoles.has('admin') && !userRoles.has('full access')) {
      return Response.json({ error: 'Admin access is required to import a schedule.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const pdfBase64 = String(body.pdf_base64 || '').replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '');
    if (!pdfBase64) return Response.json({ error: 'PDF data is required.' }, { status: 400 });
    if (pdfBase64.length > 10_000_000) return Response.json({ error: 'The PDF must be smaller than 7 MB.' }, { status: 413 });

    // Always match against the live system directories. The client cannot supply
    // stale or renamed officer/site values to the parser.
    const [directoryUsers, systemLocations] = await Promise.all([
      base44.asServiceRole.entities.User.list('-updated_date', 2000),
      base44.asServiceRole.entities.Location.list('site_name', 2000),
    ]);
    const officers: Officer[] = (directoryUsers || []).filter((person: any) =>
      person?.email && !person?.termination_date && normalized(person.employment_status) !== 'terminated'
    ).map((person: any) => ({
      email: String(person.email),
      name: [person.first_name, person.last_name].filter(Boolean).join(' ') || person.full_name || person.email,
      rank: person.rank || '',
      unit_number: person.unit_number || '',
    }));
    const locations: Site[] = (systemLocations || []).filter((site: any) =>
      site?.site_name && site.active !== false
    ).map((site: any) => ({
      site_name: String(site.site_name),
      address: String(site.address || ''),
    }));
    if (!officers.length) return Response.json({ error: 'The active officer directory is empty.' }, { status: 400 });
    if (!locations.length) return Response.json({ error: 'The active site directory is empty.' }, { status: 400 });

    const binary = atob(pdfBase64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
      return Response.json({ error: 'The selected file is not a readable PDF.' }, { status: 400 });
    }

    // PDF.js still initializes a "fake worker" when disableWorker is used in
    // server runtimes. Register the packaged worker module explicitly so Deno
    // never tries to resolve a missing relative pdf.worker.mjs file.
    (globalThis as any).pdfjsWorker = await import(
      'npm:pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs'
    );
    const pdfjs = await import('npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: bytes,
      disableWorker: true,
      useSystemFonts: true,
    }).promise;
    const shifts: any[] = [];
    const issues: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const textItems: TextItem[] = textContent.items
        .filter((item: any) => String(item.str || '').trim())
        .map((item: any) => ({
          text: String(item.str).trim(),
          x: Number(item.transform?.[4] || 0),
          y: Number(item.transform?.[5] || 0),
          width: Math.abs(Number(item.width || 0)),
          height: Math.abs(Number(item.height || item.transform?.[3] || 0)),
        }));

      const dayHeaders = textItems.filter(item => /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+\d{1,2}\/\d{1,2}$/i.test(item.text))
        .sort((a, b) => a.x - b.x);
      if (!dayHeaders.length) {
        issues.push(`Page ${pageNumber}: no calendar day headings were found.`);
        continue;
      }
      const dates = dayHeaders.map(item => {
        const match = item.text.match(/(\d{1,2})\/(\d{1,2})/)!;
        return closestYearDate(Number(match[1]), Number(match[2]));
      });
      for (let index = 1; index < dates.length; index += 1) {
        const expected = addDays(dates[index - 1], 1);
        if (dates[index] !== expected) {
          const [, month, day] = dates[index].match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
          dates[index] = `${expected.slice(0, 4)}-${month}-${day}`;
        }
      }

      const midnightLabels = textItems.filter(item => /^12:00\s*AM$/i.test(item.text) && item.x < 230)
        .sort((a, b) => b.y - a.y);
      const resourceLabels = textItems.filter(item =>
        item.x < 160 && /^[^,]{2,},\s*[^,]{2,}$/.test(item.text)
      ).sort((a, b) => b.y - a.y);
      if (!midnightLabels.length || !resourceLabels.length) {
        issues.push(`Page ${pageNumber}: the officer rows or hourly grid could not be found.`);
        continue;
      }

      const operationList = await page.getOperatorList();
      let current: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      const boxes: Box[] = [];
      for (let index = 0; index < operationList.fnArray.length; index += 1) {
        const fn = operationList.fnArray[index];
        const args = operationList.argsArray[index];
        if (fn === pdfjs.OPS.save) stack.push([...current] as Matrix);
        else if (fn === pdfjs.OPS.restore) current = stack.pop() || current;
        else if (fn === pdfjs.OPS.transform && Array.isArray(args) && args.length >= 6) {
          current = multiply(current, args.slice(0, 6) as Matrix);
        } else if (fn === pdfjs.OPS.constructPath) {
          const bounds = args?.[2];
          if (!bounds || bounds.length < 4) continue;
          const first = point(current, Number(bounds[0]), Number(bounds[1]));
          const second = point(current, Number(bounds[2]), Number(bounds[3]));
          const box = {
            x: Math.min(first.x, second.x),
            y: Math.min(first.y, second.y),
            width: Math.abs(second.x - first.x),
            height: Math.abs(second.y - first.y),
          };
          // Kendo scheduler event rectangles are slightly narrower than a day
          // column and taller than a single text line.
          if (box.width >= 90 && box.width <= 120 && box.height >= 25) boxes.push(box);
        }
      }

      const eventBoxes = uniqueBoxes(boxes);
      for (const box of eventBoxes) {
        const column = dayHeaders.reduce((best, header, index) => {
          const distance = Math.abs((header.x - 25) - box.x);
          return distance < best.distance ? { index, distance } : best;
        }, { index: -1, distance: Number.POSITIVE_INFINITY });
        if (column.index < 0 || column.distance > 45) continue;

        const segmentIndex = midnightLabels.findIndex(midnight => {
          const top = midnight.y + 23.5;
          const bottom = top - (24 * 74);
          return box.y >= bottom - 2 && box.y + box.height <= top + 2;
        });
        if (segmentIndex < 0) continue;
        const midnight = midnightLabels[segmentIndex];
        const gridTop = midnight.y + 23.5;
        const pixelsPerHour = (() => {
          const nextHours = textItems.filter(item => /^1:00\s*AM$/i.test(item.text) && item.x < 230);
          const next = nextHours.sort((a, b) => Math.abs(a.y - midnight.y) - Math.abs(b.y - midnight.y))[0];
          return next ? Math.abs(midnight.y - next.y) : 74;
        })();
        const rawStart = ((gridTop - (box.y + box.height)) / pixelsPerHour) * 60;
        // Kendo draws the event rectangle one PDF point inside its closing
        // grid line. Include that border point so 02:00 and 24:00 do not become
        // 01:59 and 23:59 after coordinate conversion.
        const rawEnd = ((gridTop - box.y + 1) / pixelsPerHour) * 60;
        if (rawEnd < -2 || rawStart > 1442) continue;
        const startMinutes = Math.max(0, Math.min(1440, Math.round(rawStart)));
        const endMinutes = Math.max(0, Math.min(1440, Math.round(rawEnd)));
        if (endMinutes - startMinutes < 10) continue;

        const resource = resourceLabels.reduce((best, label) => {
          const distance = Math.abs(label.y - (gridTop + 38));
          return distance < best.distance ? { label, distance } : best;
        }, { label: null as TextItem | null, distance: Number.POSITIVE_INFINITY }).label;
        if (!resource) continue;

        const inside = textItems.filter(item =>
          item.x >= box.x - 1 && item.x <= box.x + box.width + 1
          && item.y >= box.y - 2 && item.y <= box.y + box.height + 2
        ).sort((a, b) => b.y - a.y || a.x - b.x);
        const eventText = inside.map(item => item.text).join(' ');
        const locationMatch = matchLocation(eventText, locations);
        if (!locationMatch.site_name) {
          issues.push(`Page ${pageNumber}, ${dates[column.index]}: site "${locationMatch.printed_site || 'unknown'}" did not match an active system location.`);
          continue;
        }

        const assignedOfficers = officersInEvent(eventText, resource.text, officers);
        if (!assignedOfficers.length) {
          issues.push(`Page ${pageNumber}: no officer printed in "${eventText}" matched the active directory.`);
          continue;
        }

        for (const officer of assignedOfficers) {
          shifts.push({
            officer_email: String(officer.email),
            officer_name_from_pdf: String(officer.name || resource.text),
            shift_date: dates[column.index],
            start_time: timeText(startMinutes),
            end_time: timeText(endMinutes),
            location: locationMatch.site_name,
            site_details: locationMatch.printed_site === locationMatch.site_name
              ? ''
              : `PDF site: ${locationMatch.printed_site}`,
            special_instructions: '',
            is_open: false,
            is_split_shift: endMinutes >= 1440 || endMinutes <= startMinutes,
          });
        }
      }
    }

    const deduplicated = shifts.filter((shift, index, rows) =>
      rows.findIndex(item =>
        item.officer_email === shift.officer_email
        && item.shift_date === shift.shift_date
        && item.start_time === shift.start_time
        && item.end_time === shift.end_time
        && normalized(item.location) === normalized(shift.location)
      ) === index
    );

    if (!deduplicated.length) {
      return Response.json({
        shifts: [],
        issues: [...issues, 'No schedule event blocks could be read. Export the schedule using the Kendo Scheduler PDF format.'],
      });
    }
    return Response.json({
      shifts: deduplicated,
      issues,
      parser: 'deterministic-pdf-geometry-v2',
      matched_sites: [...new Set(deduplicated.map(shift => shift.location))],
      matched_officers: [...new Set(deduplicated.map(shift => shift.officer_email))],
    });
  } catch (error) {
    console.error('parseSchedulePdf failed', error);
    return Response.json({ error: error?.message || 'Unable to extract the schedule PDF.' }, { status: 500 });
  }
});
