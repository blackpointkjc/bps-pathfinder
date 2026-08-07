const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const fmtDate = (value, includeTime = false) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleString('en-US', includeTime
    ? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
};

const fullAddress = (notice) => [
  notice.subject_address,
  [notice.subject_city, notice.subject_state, notice.subject_zip].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' $1'),
].filter(Boolean).join('\n');

export function resolvePoliceDepartment(location = {}) {
  const haystack = [
    location.site_name,
    location.address,
    location.subdivision,
    location.division,
    location.city,
    location.county,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/richmond/.test(haystack)) return 'Richmond Police Department';
  if (/henrico/.test(haystack)) return 'Henrico County Police Division';
  if (/chesterfield/.test(haystack)) return 'Chesterfield County Police Department';
  if (/hanover/.test(haystack)) return 'Hanover County Sheriff’s Office';
  if (/petersburg/.test(haystack)) return 'Petersburg Bureau of Police';
  if (/hopewell/.test(haystack)) return 'Hopewell Police Department';
  if (/colonial heights/.test(haystack)) return 'Colonial Heights Police Department';
  if (/fairfax county/.test(haystack)) return 'Fairfax County Police Department';
  if (/fairfax city/.test(haystack)) return 'City of Fairfax Police Department';
  if (/alexandria/.test(haystack)) return 'Alexandria Police Department';
  if (/arlington/.test(haystack)) return 'Arlington County Police Department';
  if (/prince william/.test(haystack)) return 'Prince William County Police Department';
  if (/norfolk/.test(haystack)) return 'Norfolk Police Department';
  if (/virginia beach/.test(haystack)) return 'Virginia Beach Police Department';
  if (/chesapeake/.test(haystack)) return 'Chesapeake Police Department';
  if (/newport news/.test(haystack)) return 'Newport News Police Department';
  if (/hampton/.test(haystack)) return 'Hampton Police Division';
  if (/portsmouth/.test(haystack)) return 'Portsmouth Police Department';
  if (/suffolk/.test(haystack)) return 'Suffolk Police Department';
  if (/baltimore county/.test(haystack)) return 'Baltimore County Police Department';
  if (/baltimore/.test(haystack)) return 'Baltimore Police Department';
  if (/prince george/.test(haystack)) return 'Prince George’s County Police Department';
  if (/montgomery/.test(haystack)) return 'Montgomery County Department of Police';
  if (/anne arundel/.test(haystack)) return 'Anne Arundel County Police Department';

  return String(location.division || '').toLowerCase().includes('maryland')
    ? 'the local Maryland law-enforcement agency'
    : 'the local law-enforcement agency';
}

export function openTrespassNoticePrint(notice, options = {}) {
  const jurisdiction = String(options.jurisdiction || 'VA').toUpperCase();
  const propertyName = options.propertyName || notice.location || '';
  const propertyAddress = options.propertyAddress || notice.location || '';
  const senderName = options.senderName || 'Black Point Protection';
  const senderAddress = options.senderAddress || propertyAddress || '';
  const senderPhone = options.senderPhone || '';
  const officerName = options.officerName || 'Officer';
  const signatureName = options.signatureName || '';
  const policeDepartment = options.policeDepartment || resolvePoliceDepartment(options.locationRecord || {
    site_name: propertyName,
    address: propertyAddress,
    division: jurisdiction === 'MD' ? 'Maryland' : 'Virginia',
  });
  const servedByPolice = Boolean(notice.police_notified);
  const legalText = jurisdiction === 'MD'
    ? 'If you return to or remain on the property after receiving this notice, you may be subject to arrest and prosecution under applicable Maryland trespass law.'
    : 'If you return to or remain on the property after receiving this notice, you may be subject to arrest and prosecution under Virginia Code § 18.2-119.';

  const subjectAddress = fullAddress(notice);
  const servedDate = fmtDate(notice.notice_date, true);
  const windowRef = window.open('', '', 'width=850,height=1100');
  if (!windowRef) return;

  windowRef.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Trespass Notice - ${esc(notice.subject_name)}</title>
  <style>
    @page { size: Letter portrait; margin: .55in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.28; }
    .no-print { position: fixed; left: 12px; top: 12px; border: 0; border-radius: 5px; background: #1d4ed8; color: #fff; padding: 8px 14px; font-size: 13px; cursor: pointer; }
    .sheet { width: 7.4in; min-height: 9.7in; margin: 0 auto; padding: .1in .1in 0; }
    h1 { margin: 0 0 .42in; text-align: center; font-size: 17pt; font-weight: 700; letter-spacing: .4px; }
    .line-row { display: grid; grid-template-columns: 48px 1fr; align-items: end; gap: 8px; margin: 7px 0; }
    .line { min-height: 18px; border-bottom: 1px solid #000; padding: 1px 4px; white-space: pre-wrap; }
    .caption { margin-top: 1px; text-align: center; font-size: 6.5pt; }
    .stack { width: 72%; margin-left: 72px; }
    .paragraph { margin: 18px 0 0; text-align: left; }
    .inline { display: inline-block; min-width: 150px; border-bottom: 1px solid #000; padding: 0 4px 1px; text-align: center; }
    .inline.long { min-width: 245px; }
    .inline.short { min-width: 92px; }
    .warning { margin-top: 18px; font-size: 9.3pt; text-align: justify; }
    .warning strong { font-weight: 800; }
    .sender { width: 67%; margin: 28px auto 0; }
    .sender .line { text-align: center; }
    .service { margin-top: 38px; font-size: 9pt; }
    .service-choice { display: inline-block; min-width: 56px; border-bottom: 1px solid #000; text-align: center; margin: 0 4px; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 28px; }
    .signature-line { min-height: 44px; border-bottom: 1px solid #000; text-align: center; padding: 2px 4px; font-family: "Brush Script MT", cursive; font-size: 16pt; }
    .signature-line img { display: block; max-width: 100%; max-height: 42px; margin: 0 auto; object-fit: contain; }
    .signature-grid .caption { font-size: 7pt; }
    .signature-meta { margin-top: 3px; text-align: center; font-size: 6.5pt; color: #333; }
    .meta { margin-top: 16px; font-size: 7pt; color: #333; text-align: center; }
    @media print { .no-print { display: none !important; } .sheet { margin: 0; width: auto; min-height: 0; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.close()">← Back to App</button>
  <main class="sheet">
    <h1>-----TRESPASS NOTICE-----</h1>

    <div class="line-row"><div>Dear:</div><div><div class="line">${esc(notice.subject_name)}</div><div class="caption">(Name)</div></div></div>
    <div class="stack">
      <div class="line">${esc(subjectAddress)}</div><div class="caption">(Current address)</div>
      <div class="line">${esc([notice.subject_city, notice.subject_state, notice.subject_zip].filter(Boolean).join(', '))}</div><div class="caption">(City or town, State and Zip)</div>
    </div>

    <div class="paragraph">
      This letter is to inform you of the fact that as of today <span class="inline short">${esc(fmtDate(notice.notice_date))}</span>,
      you, <span class="inline long">${esc(notice.subject_name)}</span>, are no longer allowed in or around the premises of
      <span class="inline long">${esc(propertyName)}</span>.
    </div>

    <div class="paragraph">
      Located at <span class="inline long">${esc(propertyAddress)}</span>, for any reason whatsoever. If you are seen in or around the premises at
      <span class="inline long">${esc(propertyName)}</span>, you will hereafter be considered as a <strong>“TRESPASSER.”</strong>
    </div>

    <div class="warning">
      <strong>YOU WILL BE ARRESTED IMMEDIATELY, IF CAUGHT TRESPASSING ON THE ABOVE NAMED PROPERTY.</strong><br />
      ${esc(legalText)} If law enforcement is required, <strong>${esc(policeDepartment)}</strong> will be contacted. This notice has been issued because: <strong>${esc(notice.reason || 'Unauthorized presence on the property')}</strong>.
      ${notice.duration ? `This notice remains in effect for ${esc(notice.duration)}.` : ''}
      ${notice.expiration_date ? ` It expires on ${esc(fmtDate(notice.expiration_date))}.` : ''}
    </div>

    <div class="paragraph">Sincerely,</div>
    <div class="sender">
      <div class="line">${esc(senderName)}</div><div class="caption">(Name of sender)</div>
      <div class="line">${esc(senderAddress)}</div><div class="caption">(Address of sender)</div>
      <div class="line">${esc(senderPhone)}</div><div class="caption">(Phone # of sender)</div>
    </div>

    <div class="service">
      Notice served in hand by ${servedByPolice ? esc(policeDepartment) : 'Black Point Protection Officer'}:
      <span class="service-choice">${servedByPolice ? 'Yes' : 'No'}</span> Yes
      <span class="service-choice">${servedByPolice ? 'No' : 'Yes'}</span> No
    </div>

    <div class="signature-grid">
      <div>
        <div class="signature-line">${notice.officer_signature_url || notice.signature_url ? `<img src="${esc(notice.officer_signature_url || notice.signature_url)}" alt="Officer signature" />` : esc(signatureName || officerName)}</div>
        <div class="caption">Issuing Officer Signature</div>
        <div class="signature-meta">${esc(officerName)}${notice.officer_signed_at ? ` • ${esc(fmtDate(notice.officer_signed_at, true))}` : ''}</div>
      </div>
      <div>
        <div class="signature-line">${notice.witness_signature_url ? `<img src="${esc(notice.witness_signature_url)}" alt="Witness signature" />` : ''}</div>
        <div class="caption">Witness Signature</div>
        <div class="signature-meta">${esc(notice.witness_name || '')}${notice.witness_signed_at ? ` • ${esc(fmtDate(notice.witness_signed_at, true))}` : ''}</div>
      </div>
      <div>
        <div class="signature-line">${notice.subject_signature_url ? `<img src="${esc(notice.subject_signature_url)}" alt="Subject signature" />` : ''}</div>
        <div class="caption">Subject Signature / Acknowledgment</div>
        <div class="signature-meta">${esc(notice.subject_name || '')}${notice.subject_signed_at ? ` • ${esc(fmtDate(notice.subject_signed_at, true))}` : ''}</div>
      </div>
    </div>
    <div class="signature-meta" style="margin-top:12px;">Served: ${esc(servedDate)}${notice.police_report_number ? ` • Police Report: ${esc(notice.police_report_number)}` : ''}</div>

    <div class="meta">${esc(jurisdiction)} TRESPASS NOTICE • ${esc(propertyName)} • Official copy</div>
  </main>
  <script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body>
</html>`);
  windowRef.document.close();
  windowRef.focus();
}
