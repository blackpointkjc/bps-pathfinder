const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const dateParts = (value) => {
  if (!value) return { full: '', mo: '', day: '', yr: '' };
  const raw = String(value).split('T')[0];
  const [yr, mo, day] = raw.split('-');
  if (!yr || !mo || !day) return { full: esc(value), mo: '', day: '', yr: '' };
  return { full: `${mo}/${day}/${yr}`, mo, day, yr };
};

const checkbox = (checked) => `<span class="box">${checked ? 'X' : ''}</span>`;

export function openVirginiaCriminalComplaintPrint(complaint, options = {}) {
  const printWindow = window.open('', '', 'width=1200,height=900');
  if (!printWindow) return;

  const dob = dateParts(complaint.accused_dob);
  const offenseDate = dateParts(complaint.offense_date).full;
  const authorizationDate = complaint.authorization_date
    ? new Date(complaint.authorization_date).toLocaleString()
    : '';
  const complainantName = options.complainantName || complaint.complainant_name || options.officerName || '';
  const accusedName = [complaint.accused_last_name, complaint.accused_first_name, complaint.accused_middle_name]
    .filter(Boolean).join(', ').replace(', ,', ',');

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Criminal Complaint - ${esc(complaint.complaint_number || '')}</title>
  <style>
    @page { size: 11in 8.5in landscape; margin: 0.22in; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font-family: "Times New Roman", Times, serif; font-size: 10.5pt; }
    .back { position: fixed; top: 10px; left: 10px; z-index: 10; border: 0; border-radius: 5px; background: #1d4ed8; color: #fff; padding: 8px 14px; font: 600 14px Arial; cursor: pointer; }
    .sheet { width: 100%; min-height: 7.85in; display: grid; grid-template-columns: minmax(0, 2.22fr) minmax(3.2in, 1fr); column-gap: 0.18in; padding: 0.04in 0.04in 0; }
    .left { position: relative; padding: 0.02in 0.03in 0; }
    .right { border: 1.4px solid #000; min-height: 7.63in; padding: 0.25in 0.12in 0.12in; }
    .topline { display: flex; justify-content: space-between; align-items: flex-start; }
    .main-title { font-size: 16pt; font-weight: 700; line-height: 1; }
    .commonwealth { font-size: 11pt; margin-top: 2px; }
    .rules { font-size: 9pt; padding-top: 4px; }
    .court-row { margin-top: 0.12in; display: grid; grid-template-columns: 1fr auto; align-items: end; }
    .locality-line, .line { border-bottom: 1px dotted #000; min-height: 18px; padding: 1px 4px; }
    .locality-caption, .caption { text-align: center; font-size: 7.5pt; line-height: 1; margin-top: 1px; }
    .courts { font-size: 10.5pt; line-height: 1.35; min-width: 2.85in; }
    .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; text-align: center; line-height: 10px; font: bold 9px Arial; vertical-align: middle; margin: 0 3px; }
    .statement { margin-top: 0.15in; text-align: center; font-size: 11pt; line-height: 1.15; }
    .offense-row { margin-top: 0.12in; display: grid; grid-template-columns: 1fr auto; align-items: end; column-gap: 8px; }
    .offense-location { font-size: 10pt; white-space: nowrap; padding-bottom: 2px; }
    .of-row { margin-top: 0.08in; display: grid; grid-template-columns: auto 1fr; align-items: end; column-gap: 5px; }
    .facts-label { margin-top: 0.1in; text-align: center; font-size: 11pt; }
    .facts { min-height: 3.18in; border-bottom: 1px dotted #000; padding: 8px 4px; white-space: pre-wrap; line-height: 1.34; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
    .affirmation { margin-top: 0.12in; font-size: 10.5pt; }
    .understand { text-align: center; margin-top: 0.08in; font-size: 10.5pt; }
    .rules-list { margin: 0.07in 0 0.08in 0.2in; padding-left: 0.16in; font-size: 10pt; line-height: 1.35; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1.08fr; gap: 0.26in; align-items: end; margin-top: 0.08in; }
    .sig-line { border-bottom: 1px solid #000; min-height: 22px; padding: 2px 4px; text-align: center; font-family: Arial, sans-serif; font-size: 9pt; }
    .sig-caption { text-align: center; font-size: 7.5pt; line-height: 1.15; margin-top: 2px; }
    .sworn { margin-top: 0.11in; font-size: 10.5pt; }
    .sworn-grid { display: grid; grid-template-columns: 1fr 1.08fr; gap: 0.26in; margin-top: 0.08in; align-items: end; }
    .official-caption { text-align: center; font-size: 8pt; margin-top: 2px; white-space: nowrap; }
    .form-number { position: absolute; bottom: 0.02in; left: 0; font-size: 7.5pt; }
    .right-double { border-top: 5px double #000; border-bottom: 5px double #000; padding: 0.08in 0; text-align: center; font-size: 16pt; font-weight: 700; margin: 0.12in 0 0.2in; }
    .accused-heading { font-size: 11pt; margin-bottom: 0.18in; }
    .right-line { border-bottom: 1px dotted #000; min-height: 30px; padding: 3px; font-family: Arial, sans-serif; font-size: 9pt; }
    .right-caption { text-align: center; font-size: 7.2pt; margin: 2px 0 0.14in; }
    .data-heading { text-align: center; font-size: 7.7pt; margin-top: 0.36in; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7pt; }
    td, th { border: 1px solid #000; text-align: center; padding: 2px 1px; height: 25px; font-weight: normal; }
    .value { font-family: Arial, sans-serif; font-size: 8pt; }
    .ssn { width: 90%; margin: 0 auto; border: 1px solid #000; border-top: 0; min-height: 32px; padding: 3px; font-family: Arial, sans-serif; font-size: 8pt; }
    .auth { margin-top: 0.45in; padding: 0 0.03in; font-size: 10pt; line-height: 1.28; }
    .auth-sub { margin: 0.05in 0 0 0.43in; }
    .auth-lines { margin-top: 0.24in; }
    .auth-line { border-bottom: 1px dotted #000; min-height: 24px; padding: 3px; text-align: center; font-family: Arial, sans-serif; font-size: 8.5pt; }
    .auth-caption { text-align: center; font-size: 7.2pt; margin: 2px 0 0.15in; }
  </style>
</head>
<body data-no-company-footer="true">
  <button class="back no-print" onclick="window.close()">Back to App</button>
  <div class="sheet">
    <section class="left">
      <div class="topline">
        <div><div class="main-title">CRIMINAL COMPLAINT</div><div class="commonwealth">Commonwealth of Virginia</div></div>
        <div class="rules">RULES 3A:3 AND 7C:3</div>
      </div>

      <div class="court-row">
        <div>
          <div class="locality-line">${esc(complaint.location || '')}</div>
          <div class="locality-caption">CITY OR COUNTY</div>
        </div>
        <div class="courts">
          <div>${checkbox(complaint.court_type === 'general_district')} General District Court</div>
          <div>${checkbox(complaint.court_type === 'juvenile_domestic')} Juvenile and Domestic Relations District Court</div>
        </div>
      </div>

      <div class="statement">Under penalty of perjury, I, the undersigned Complainant swear or affirm that I have reason to believe that the<br/>Accused committed a criminal offense, on or about</div>
      <div class="offense-row">
        <div><div class="line" style="text-align:center">${esc(offenseDate)}</div><div class="caption">DATE OFFENSE OCCURRED</div></div>
        <div class="offense-location">in the ${checkbox(complaint.location_type === 'city')} City ${checkbox(complaint.location_type === 'county')} County ${checkbox(complaint.location_type === 'town')} Town</div>
      </div>
      <div class="of-row"><span>of</span><div class="line">${esc(options.displayLocation || complaint.location || '')}</div></div>

      <div class="facts-label">I base my belief on the following facts: &nbsp;(Print <strong>ALL</strong> information clearly.)</div>
      <div class="facts">${esc(complaint.facts_basis || '')}</div>

      <div class="affirmation">The statements above are true and accurate to the best of my knowledge and belief.</div>
      <div class="understand">In making this complaint, I have read and fully understand the following:</div>
      <ul class="rules-list">
        <li>By swearing to these facts, I agree to appear in court and testify if a warrant or summons is issued.</li>
        <li>The charge in this warrant cannot be dismissed except by the court, even at my request.</li>
      </ul>

      <div class="signature-grid">
        <div><div class="sig-line">${esc(complainantName)}</div><div class="sig-caption">NAME OF COMPLAINANT (LAST, FIRST, MIDDLE)<br/>(PRINT CLEARLY)</div></div>
        <div><div class="sig-line">${esc(options.signatureName || '')}</div><div class="sig-caption">SIGNATURE OF COMPLAINANT</div></div>
      </div>

      <div class="sworn">Subscribed and sworn to before me this day.</div>
      <div class="sworn-grid">
        <div><div class="sig-line"></div><div class="sig-caption">DATE AND TIME</div></div>
        <div><div class="sig-line"></div><div class="official-caption">${checkbox(false)} CLERK &nbsp;&nbsp; ${checkbox(false)} MAGISTRATE &nbsp;&nbsp; ${checkbox(false)} JUDGE</div></div>
      </div>
      <div class="form-number">FORM DC-311 REVISED 07/11</div>
    </section>

    <aside class="right">
      <div class="right-double">CRIMINAL COMPLAINT</div>
      <div class="accused-heading">ACCUSED: &nbsp;Name, Description, Address/Location</div>
      <div class="right-line">${esc(accusedName)}</div>
      <div class="right-caption">LAST NAME, FIRST NAME, MIDDLE NAME</div>
      <div class="right-line">${esc(complaint.accused_address || '')}</div>
      <div class="right-line"></div>

      <div class="data-heading">COMPLETE DATA BELOW IF KNOWN</div>
      <table>
        <tr><td>RACE</td><td>SEX</td><td colspan="3">BORN</td><td colspan="2">HT.</td><td>WGT.</td><td>EYES</td><td>HAIR</td></tr>
        <tr><td class="value" rowspan="2">${esc(complaint.accused_race || '')}</td><td class="value" rowspan="2">${esc(String(complaint.accused_sex || '').charAt(0).toUpperCase())}</td><td>MO.</td><td>DAY</td><td>YR.</td><td>FT.</td><td>IN.</td><td class="value" rowspan="2">${esc(complaint.accused_weight || '')}</td><td class="value" rowspan="2">${esc(complaint.accused_eyes || '')}</td><td class="value" rowspan="2">${esc(complaint.accused_hair || '')}</td></tr>
        <tr><td class="value">${esc(dob.mo)}</td><td class="value">${esc(dob.day)}</td><td class="value">${esc(dob.yr)}</td><td class="value">${esc(complaint.accused_height_ft || '')}</td><td class="value">${esc(complaint.accused_height_in || '')}</td></tr>
      </table>
      <div class="ssn"><span style="font-size:7pt">SSN</span><br/>${esc(complaint.accused_ssn || '')}</div>

      <div class="auth">
        <div>${checkbox(complaint.is_law_enforcement === false)} Complainant is not a law-enforcement officer or<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;animal control officer. &nbsp;Authorization prior to<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;issuance of felony arrest warrant given by</div>
        <div class="auth-sub">${checkbox(complaint.is_law_enforcement === false && complaint.authorization_type === 'commonwealth_attorney')} Commonwealth's attorney</div>
        <div class="auth-sub">${checkbox(complaint.is_law_enforcement === false && complaint.authorization_type === 'law_enforcement')} Law-enforcement agency having<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;jurisdiction over alleged offense</div>
        <div class="auth-lines">
          <div class="auth-line">${esc(complaint.authorization_given_by || '')}</div>
          <div class="auth-caption">NAME OF PERSON AUTHORIZING ISSUANCE OF WARRANT</div>
          <div class="auth-line">${esc(authorizationDate)}</div>
          <div class="auth-caption">DATE AND TIME AUTHORIZATION GIVEN</div>
        </div>
      </div>
    </aside>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();
}
