const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const marked = (condition) => `<span class="box">${condition ? 'X' : ''}</span>`;
const valueOrBlank = (value) => esc(value || '&nbsp;');

function field(value, label, className = '') {
  return `<div class="field ${className}"><div class="field-value">${valueOrBlank(value)}</div>${label ? `<div class="field-label">${label}</div>` : ''}</div>`;
}

function witnessBlock(witness = {}) {
  const fullName = [witness.last_name, witness.first_name, witness.middle_name].filter(Boolean).join(', ');
  const locality = witness.locality_type === 'county'
    ? `${marked(false)} CITY OF&nbsp;&nbsp; ${marked(true)} COUNTY NAME`
    : `${marked(true)} CITY OF&nbsp;&nbsp; ${marked(false)} COUNTY NAME`;
  const phone = [witness.phone_area ? `(${esc(witness.phone_area)})` : '(...............)', esc(witness.phone_number || '')].join(' ');
  return `
    <section class="witness">
      ${field(fullName, 'NAME (LAST, FIRST, MIDDLE)')}
      ${field(witness.street_address, 'STREET ADDRESS/LOCATION')}
      ${field(witness.city_state_zip, 'CITY, STATE, ZIP CODE')}
      <div class="locality">${locality}<span class="locality-name">${esc(witness.locality_name || '')}</span></div>
      ${field(phone, 'TELEPHONE NUMBER', 'phone')}
    </section>`;
}

function mainPage(form) {
  const witnesses = [...(form.witnesses || []).slice(0, 4)];
  while (witnesses.length < 4) witnesses.push({});
  const captionMark = form.case_caption_type === 'in_re';
  const behalf = form.requested_on_behalf_of || 'commonwealth';
  const signature = form.requested_by_signature_url
    ? `<img class="signature" src="${esc(form.requested_by_signature_url)}" alt="" />`
    : '';
  const courtDateTime = [
    form.court_date || '',
    form.court_time || '',
    form.court_time ? (form.court_time_period || '') : '',
  ].filter(Boolean).join(' ');

  return `
  <section class="sheet">
    <main class="official-left">
      <header class="official-header">
        <div>
          <h1>REQUEST FOR WITNESS SUBPOENA</h1>
          <div class="commonwealth">Commonwealth of Virginia</div>
        </div>
        <div class="authority">VA. CODE §§ 8.01-407, 16.1-265, 17.1-617, 19.2-267<br />Rules 3A:12, 7A:12, 8:13</div>
      </header>

      <div class="please">(PLEASE PRINT)</div>
      ${field(form.court_location, 'CITY OR COUNTY', 'court-location')}

      <div class="court-row">
        <div>${marked(form.court_type === 'general_district')} GENERAL DISTRICT COURT
          <span class="case-types">(${marked(form.general_case_type === 'civil')} Civil
          ${marked(form.general_case_type === 'criminal')} Criminal
          ${marked(form.general_case_type === 'traffic')} Traffic)</span>
        </div>
        <div>${marked(form.court_type === 'juvenile_domestic')} JUVENILE AND DOMESTIC RELATIONS DISTRICT COURT</div>
      </div>

      <p class="instructions">Please subpoena the witnesses below to appear before the Court on the date shown. (See Va. Code § 17.1-617 regarding limitation on compensation of subpoenaed witnesses.) Requests for subpoenas for witnesses should be filed at least ten days prior to trial or hearing.</p>
      <h2 class="witness-title">WITNESSES (IF MAILING ADDRESS IS RFD, P.O. BOX, ETC., PLEASE INDICATE<br />LOCATION WHERE WITNESSES CAN BE FOUND.)</h2>

      <div class="witness-grid">
        ${witnesses.map(witnessBlock).join('')}
      </div>
      <footer>FORM DC-325 REVISED 10/08</footer>
    </main>

    <aside class="official-caption">
      <div class="case-number">CASE NO.</div>
      ${field(form.case_number, '', 'case-number-line')}
      <h1>REQUEST FOR WITNESS SUBPOENA</h1>

      <div class="caption-choice">${marked(form.jurisdiction_type === 'commonwealth')} Commonwealth of Virginia</div>
      <div class="caption-choice">${marked(form.jurisdiction_type === 'locality')}
        ${marked(form.jurisdiction_type === 'locality' && form.locality_type === 'city')} CITY
        ${marked(form.jurisdiction_type === 'locality' && form.locality_type === 'county')} COUNTY
        ${marked(form.jurisdiction_type === 'locality' && form.locality_type === 'town')} TOWN of
      </div>
      ${field(form.locality_name, '')}

      <div class="caption-party">
        ${marked(Boolean(form.plaintiff_petitioner_name))}
        ${field(form.plaintiff_petitioner_name, 'NAME OF PLAINTIFF(S)/PETITIONER(S) (LAST, FIRST, MIDDLE)<br />(IN CIVIL CASES ONLY)')}
      </div>

      <div class="versus">${captionMark ? 'In re' : 'v.'}</div>
      ${field(form.defendant_child_name, 'NAME OF DEFENDANT/CHILD (LAST, FIRST, MIDDLE)<br />LIST ONLY ONE DEFENDANT')}

      <div class="charge-row"><span>Charge:</span>${field(form.charge, '(TRAFFIC OR CRIMINAL CASE)')}</div>

      <h2 class="court-date-title">COURT DATE AND TIME:</h2>
      ${field(courtDateTime, '', 'court-date-line')}

      <div class="section-label">REQUEST ON BEHALF OF</div>
      <div class="behalf">
        <span>${marked(behalf === 'commonwealth')} Commonwealth</span>
        <span>${marked(behalf === 'locality')} City, County, Town of</span>
        <span>${marked(behalf === 'plaintiff')} PLAINTIFF(S)</span>
        <span>${marked(behalf === 'defendant')} DEFENDANT(S)</span>
        <span>${marked(behalf === 'juvenile')} JUVENILE</span>
        <span>${marked(behalf === 'petitioner')} PETITIONER</span>
        <span>${marked(behalf === 'respondent')} RESPONDENT</span>
      </div>

      <div class="requested-rule"></div>
      <div class="section-label">REQUESTED BY:</div>
      ${field(form.requested_by_name, 'PRINTED NAME')}
      <div class="field signature-field"><div class="field-value">${signature}</div><div class="field-label">SIGNATURE</div></div>
      ${field(`${form.requested_by_phone_area ? `(${form.requested_by_phone_area})` : '(...............)'} ${form.requested_by_phone_number || ''}`, 'TELEPHONE NUMBER')}

      <div class="court-use-title">COURT USE ONLY</div>
      <div class="court-use">
        ${field(form.date_received, 'DATE RECEIVED')}
        ${field(form.date_issued, 'DATE ISSUED')}
      </div>
    </aside>
  </section>`;
}

function continuationPage(form, witnesses, pageNumber) {
  const rows = [...witnesses];
  while (rows.length < 4) rows.push({});
  return `
  <section class="sheet continuation-sheet">
    <main class="continuation">
      <header>
        <div><h1>REQUEST FOR WITNESS SUBPOENA</h1><div>WITNESS CONTINUATION SHEET</div></div>
        <div class="continuation-case"><strong>CASE NO.</strong> ${esc(form.case_number || '')}<br /><strong>CITY OR COUNTY</strong> ${esc(form.court_location || '')}</div>
      </header>
      <p>Additional witnesses requested for ${esc(form.plaintiff_petitioner_name || '')} ${form.case_caption_type === 'in_re' ? 'In re' : 'v.'} ${esc(form.defendant_child_name || '')}</p>
      <div class="witness-grid">${rows.map(witnessBlock).join('')}</div>
      <footer><span>FORM DC-325 - WITNESS CONTINUATION</span><span>PAGE ${pageNumber}</span></footer>
    </main>
  </section>`;
}

export function buildDc325PrintHtml(form) {
  const extraPages = [];
  const witnesses = form.witnesses || [];
  for (let index = 4; index < witnesses.length; index += 4) {
    extraPages.push(continuationPage(form, witnesses.slice(index, index + 4), extraPages.length + 2));
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>DC-325 Request for Witness Subpoena</title>
<style>
  @page { size: 11in 8.5in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Arial Narrow", Arial, Helvetica, sans-serif; font-size: 9.2pt; line-height: 1.16; }
  .sheet { width: 11in; height: 8.5in; padding: .34in .42in .26in; display: grid; grid-template-columns: 6.50in 3.51in; column-gap: .16in; background: #fff; overflow: hidden; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  h1, h2, p { margin: 0; }
  .official-left { min-width: 0; height: 7.90in; display: flex; flex-direction: column; }
  .official-header { height: .55in; display: grid; grid-template-columns: 1fr auto; align-items: start; }
  .official-header h1 { font-size: 13.5pt; letter-spacing: 2.3px; font-weight: 700; }
  .commonwealth { font-size: 11pt; margin-top: 2px; }
  .authority { font-size: 7.2pt; line-height: 1.45; text-align: right; padding-top: 4px; }
  .please { text-align: center; font-size: 11pt; font-weight: 700; letter-spacing: 1.8px; height: .28in; }
  .field { min-width: 0; }
  .field-value { min-height: .22in; padding: 1px 4px 0; border-bottom: 1.3px dotted #000; font-size: 9.4pt; overflow: hidden; white-space: pre-wrap; }
  .field-label { text-align: left; padding-top: 2px; font-size: 6.3pt; letter-spacing: 1.25px; line-height: 1.2; }
  .court-location { width: 100%; margin-bottom: 4px; }
  .court-location .field-label { text-align: center; }
  .court-row { font-size: 10.2pt; letter-spacing: 1.2px; line-height: 1.55; }
  .case-types { letter-spacing: 0; font-size: 9pt; }
  .box { display: inline-flex; width: 11px; height: 11px; margin-right: 2px; border: 1px solid #000; align-items: center; justify-content: center; vertical-align: -1px; font-size: 8px; line-height: 1; font-weight: 700; }
  .instructions { margin-top: .25in; font-size: 9.3pt; line-height: 1.38; }
  .witness-title { margin: .22in 0 .12in; font-size: 10.3pt; line-height: 1.35; letter-spacing: 1.5px; font-weight: 500; }
  .witness-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; border-top: 1px solid #000; border-left: 1px solid #000; }
  .witness { min-width: 0; padding: .17in .08in .08in; border-right: 1px solid #000; border-bottom: 1px solid #000; display: flex; flex-direction: column; justify-content: space-between; }
  .witness .field-value { min-height: .23in; }
  .witness .field-label { font-size: 6.2pt; }
  .locality { min-height: .30in; display: flex; align-items: end; font-size: 7.3pt; letter-spacing: 1px; }
  .locality-name { flex: 1; min-height: .20in; margin-left: 5px; border-bottom: 1.3px dotted #000; letter-spacing: 0; font-size: 9pt; }
  .phone .field-value { font-size: 9pt; }
  .official-left footer { height: .22in; padding-top: .08in; font-size: 7.2pt; letter-spacing: 1.1px; }

  .official-caption { height: 7.58in; margin-top: .04in; border: 1px solid #000; padding: .08in .10in; display: flex; flex-direction: column; min-width: 0; }
  .case-number { text-align: center; font-size: 11pt; letter-spacing: 2px; }
  .case-number-line .field-value { min-height: .22in; }
  .official-caption > h1 { margin: 1px 0 .08in; padding: .05in 0; border-top: 3px double #000; border-bottom: 3px double #000; text-align: center; font-size: 11.5pt; letter-spacing: 2px; }
  .caption-choice { min-height: .23in; font-size: 10.5pt; letter-spacing: .6px; }
  .caption-party { display: grid; grid-template-columns: .20in 1fr; gap: 2px; align-items: start; margin-top: .14in; }
  .caption-party > .box { margin-top: 2px; }
  .caption-party .field-label, .official-caption > .field .field-label { text-align: center; }
  .versus { text-align: center; font-size: 11pt; font-style: italic; font-weight: 700; margin: .14in 0 .09in; }
  .charge-row { display: grid; grid-template-columns: auto 1fr; gap: 5px; align-items: end; margin-top: .10in; font-size: 10.5pt; }
  .charge-row .field-label { text-align: center; }
  .court-date-title { margin-top: .13in; font-size: 10.5pt; letter-spacing: 1.4px; font-weight: 500; }
  .court-date-line { margin-top: .05in; }
  .court-date-line .field-value { min-height: .27in; border-bottom-style: solid; }
  .section-label { margin-top: .08in; font-size: 6.5pt; letter-spacing: 1px; }
  .behalf { margin-top: .06in; display: grid; grid-template-columns: 1fr 1.25fr; row-gap: 5px; font-size: 8.7pt; }
  .requested-rule { border-top: 1px solid #000; margin-top: .17in; }
  .signature-field .field-value { height: .34in; position: relative; }
  .signature { max-width: 100%; max-height: .30in; object-fit: contain; object-position: left bottom; }
  .court-use-title { margin-top: auto; border-bottom: 1px solid #000; text-align: center; font-size: 6.6pt; letter-spacing: 1px; }
  .court-use { display: grid; grid-template-columns: 1fr 1fr; }
  .court-use .field:first-child { border-right: 1px solid #000; }
  .court-use .field-value { border-bottom: 0; min-height: .24in; }
  .court-use .field-label { text-align: center; }

  .continuation-sheet { display: block; }
  .continuation { height: 7.90in; display: flex; flex-direction: column; }
  .continuation header { display: flex; justify-content: space-between; align-items: start; border-bottom: 3px double #000; padding-bottom: .10in; }
  .continuation header h1 { font-size: 14pt; letter-spacing: 2px; }
  .continuation header > div:first-child > div { font-size: 9pt; letter-spacing: 1.5px; }
  .continuation-case { width: 3.2in; line-height: 1.7; }
  .continuation > p { margin: .12in 0; }
  .continuation footer { display: flex; justify-content: space-between; padding-top: .08in; font-size: 7pt; letter-spacing: 1px; }

  @media screen {
    body { background: #d8dde3; padding: 20px; }
    .sheet { margin: 0 auto 20px; box-shadow: 0 4px 18px rgba(0,0,0,.22); }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>
${mainPage(form)}
${extraPages.join('')}
</body>
</html>`;
}

export function printDc325(form) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('The print window was blocked. Allow pop-ups for Pathfinder and try again.');
  }
  printWindow.document.open();
  printWindow.document.write(buildDc325PrintHtml(form));
  printWindow.document.close();
  printWindow.addEventListener('load', () => {
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }, { once: true });
}
