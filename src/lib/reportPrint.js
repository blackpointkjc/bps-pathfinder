const DEFAULT_TIME_ZONE = 'America/New_York';

export function escapePrintHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

export function resolveReportTimeZone(locationRecord, fallback = DEFAULT_TIME_ZONE) {
  const candidate = locationRecord?.time_zone || locationRecord?.timezone || locationRecord?.device_timezone || fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(dateOnly ? `${text}T12:00:00` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function reportTimeZoneLabel(timeZone = DEFAULT_TIME_ZONE, value = new Date()) {
  const date = asDate(value) || new Date();
  try {
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
    return label || (timeZone === DEFAULT_TIME_ZONE ? 'ET' : timeZone);
  } catch {
    return 'ET';
  }
}

export function formatReportDate(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = asDate(value);
  if (!date) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatReportDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = asDate(value);
  if (!date) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function formatReportClock(value) {
  if (!value) return 'Not recorded';
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return text;
  const hour = Number(match[1]);
  if (hour > 23) return text;
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function safeImageUrl(value) {
  const url = String(value || '').trim();
  return /^(https?:|data:image\/)/i.test(url) ? escapePrintHtml(url) : '';
}

function renderValue(value) {
  if (value === undefined || value === null || value === '') return '<span class="empty">Not recorded</span>';
  return escapePrintHtml(value).replace(/\r?\n/g, '<br />');
}

function renderSection(section) {
  const fields = (section?.fields || []).filter(Boolean);
  if (!fields.length) return '';
  return `
    <section class="report-section">
      <h2>${escapePrintHtml(section.title || 'Report Details')}</h2>
      <div class="field-grid">
        ${fields.map(field => {
          const breakable = field.breakable === true || String(field.value ?? '').length > 500;
          return `
          <div class="field ${field.wide ? 'field-wide' : ''} ${breakable ? 'field-breakable' : ''}">
            <div class="field-label">${escapePrintHtml(field.label || '')}</div>
            <div class="field-value">${renderValue(field.value)}</div>
          </div>
        `;
        }).join('')}
      </div>
    </section>
  `;
}

export function openBlackPointReport({
  title,
  subtitle = 'Pathfinder Report Record',
  reportNumber = '',
  status = '',
  timeZone = DEFAULT_TIME_ZONE,
  meta = [],
  sections = [],
  officer = {},
  signedAt = '',
  signatureUrl = '',
  photos = [],
  footerNote = '',
}) {
  const printWindow = window.open('', '', 'width=900,height=1100');
  if (!printWindow) throw new Error('Pop-up blocked. Allow pop-ups to print this report.');

  const zoneLabel = reportTimeZoneLabel(timeZone, signedAt || new Date());
  const signatureImage = safeImageUrl(signatureUrl);
  const signatureName = officer.signatureName || officer.name || officer.email || 'Officer';
  const cleanedPhotos = (photos || []).map(safeImageUrl).filter(Boolean);
  const metaItems = [
    ...(reportNumber ? [{ label: 'Report Number', value: reportNumber }] : []),
    ...meta,
    { label: 'Time Zone', value: `${zoneLabel} · ${timeZone}` },
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapePrintHtml(title || 'Black Point Report')}${reportNumber ? ` - ${escapePrintHtml(reportNumber)}` : ''}</title>
  <style>
    @page { size: Letter; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #0b1725; font-family: "Segoe UI", Arial, sans-serif; font-size: 8.4pt; line-height: 1.28; }
    body { background: #e8edf2; }
    .print-actions { position: fixed; z-index: 50; top: 12px; left: 12px; display: flex; gap: 8px; }
    .print-actions button { border: 0; border-radius: 6px; padding: 9px 13px; color: #fff; background: #0b1725; font-weight: 800; cursor: pointer; }
    .page-shell { width: 8.5in; max-width: 100%; margin: 18px auto; border-collapse: collapse; background: #fff; box-shadow: 0 16px 45px rgba(2, 9, 18, .22); }
    .page-shell > thead { display: table-header-group; }
    .page-shell > thead > tr > td { padding: .28in .34in .12in; }
    .page-shell > tbody > tr > td { padding: 0 .34in .3in; vertical-align: top; }
    .brand-header { overflow: hidden; border: 1.5px solid #132a41; border-radius: 8px; }
    .brand-strip { height: 5px; background: linear-gradient(90deg, #56d8ee 0 28%, #d51f2b 28% 42%, #0b1725 42%); }
    .brand-main { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 10px 13px 9px; color: #fff; background: #0b1725; }
    .brand-name { color: #63e6f4; font-size: 7pt; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 2px 0 0; font-size: 15pt; line-height: 1; letter-spacing: .04em; text-transform: uppercase; }
    .subtitle { margin-top: 4px; color: #c5d5e5; font-size: 7.5pt; }
    .status { min-width: 76px; border: 1px solid #36536f; border-radius: 6px; padding: 6px 8px; text-align: center; color: #fff; font-size: 7pt; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #b8c7d5; border-top: 0; }
    .meta-item { min-width: 0; padding: 6px 8px; border-right: 1px solid #d6e0e8; }
    .meta-item:last-child { border-right: 0; }
    .meta-label, .field-label { color: #496176; font-size: 6.3pt; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .meta-value { margin-top: 1px; color: #0b1725; font-weight: 750; overflow-wrap: anywhere; }
    .report-section { margin: 0 0 7px; break-inside: auto; page-break-inside: auto; }
    .report-section h2 { margin: 0; padding: 4px 7px; color: #fff; background: #132a41; border-left: 5px solid #d51f2b; font-size: 7.4pt; letter-spacing: .09em; text-transform: uppercase; break-after: avoid; page-break-after: avoid; }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid #b8c7d5; border-top: 0; }
    .field { min-width: 0; padding: 5px 7px; border-right: 1px solid #d6e0e8; border-bottom: 1px solid #d6e0e8; break-inside: avoid; page-break-inside: avoid; }
    .field:nth-child(even) { border-right: 0; }
    .field-wide { grid-column: 1 / -1; border-right: 0; }
    .field-breakable { break-inside: auto; page-break-inside: auto; }
    .field-value { margin-top: 2px; color: #0b1725; white-space: normal; overflow-wrap: anywhere; }
    .empty { color: #7b8c9b; font-style: italic; }
    .photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .photos img { display: block; width: 100%; max-height: 2.15in; object-fit: contain; border: 1px solid #b8c7d5; background: #f8fafc; break-inside: avoid; }
    .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; padding: 8px 10px; border: 1.5px solid #132a41; border-left: 5px solid #56d8ee; break-inside: avoid; page-break-inside: avoid; }
    .signature-mark { min-height: 23px; margin-top: 2px; padding: 2px 3px; border-bottom: 1px solid #0b1725; color: #0b1725; font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 12pt; font-weight: 700; }
    .signature-mark img { max-width: 220px; max-height: 38px; object-fit: contain; }
    .signature-detail { margin-top: 3px; color: #496176; font-size: 6.5pt; }
    .document-footer { margin-top: 7px; padding-top: 4px; border-top: 1px solid #b8c7d5; color: #496176; font-size: 6.2pt; text-align: center; }
    @media print {
      html, body { background: #fff; }
      .no-print { display: none !important; }
      .page-shell { width: 100%; margin: 0; box-shadow: none; }
      .field:not(.field-breakable), .signature, .photos img { break-inside: avoid; page-break-inside: avoid; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="print-actions no-print">
    <button type="button" onclick="window.print()">Print / Save PDF</button>
    <button type="button" onclick="window.close()">Back to Pathfinder</button>
  </div>
  <table class="page-shell">
    <thead>
      <tr>
        <td>
          <div class="brand-header">
            <div class="brand-strip"></div>
            <div class="brand-main">
              <div>
                <div class="brand-name">Black Point Protection · Pathfinder</div>
                <h1>${escapePrintHtml(title || 'Report')}</h1>
                <div class="subtitle">${escapePrintHtml(subtitle)}</div>
              </div>
              ${status ? `<div class="status">${escapePrintHtml(status)}</div>` : ''}
            </div>
          </div>
          <div class="meta-grid">
            ${metaItems.map(item => `<div class="meta-item"><div class="meta-label">${escapePrintHtml(item.label || '')}</div><div class="meta-value">${renderValue(item.value)}</div></div>`).join('')}
          </div>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          ${sections.map(renderSection).join('')}
          ${cleanedPhotos.length ? `<section class="report-section"><h2>Photo Documentation</h2><div class="photos">${cleanedPhotos.map(url => `<img src="${url}" alt="Report documentation" />`).join('')}</div></section>` : ''}
          <section class="signature">
            <div>
              <div class="field-label">Reporting Officer Signature</div>
              <div class="signature-mark">${signatureImage ? `<img src="${signatureImage}" alt="Officer signature" />` : `/s/ ${escapePrintHtml(signatureName)}`}</div>
              <div class="signature-detail">${escapePrintHtml(officer.name || signatureName)}${officer.badge ? ` · Badge ${escapePrintHtml(officer.badge)}` : ''}${officer.unit ? ` · Unit ${escapePrintHtml(officer.unit)}` : ''}</div>
            </div>
            <div>
              <div class="field-label">Signature Date</div>
              <div class="signature-mark" style="font-family: inherit; font-size: 9pt;">${escapePrintHtml(formatReportDateTime(signedAt, timeZone))}</div>
              <div class="signature-detail">Electronically signed through the authenticated Pathfinder account${officer.ip ? ` · IP ${escapePrintHtml(officer.ip)}` : ''}</div>
            </div>
          </section>
          <div class="document-footer">Official Black Point Protection record. Times are displayed in ${escapePrintHtml(timeZone)} (${escapePrintHtml(zoneLabel)}).${footerNote ? ` ${escapePrintHtml(footerNote)}` : ''}</div>
        </td>
      </tr>
    </tbody>
  </table>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  return printWindow;
}
