import { format } from 'date-fns';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const dateValue = (value) => {
  if (!value) return '';
  try { return format(new Date(value), 'MM/dd/yyyy'); } catch { return esc(value); }
};

const check = (condition) => `<span class="box">${condition ? '✓' : ''}</span>`;
const field = (label, value, cls = '') => `<div class="field ${cls}"><div class="label">${label}</div><div class="value">${esc(value)}</div></div>`;

export function buildVirginiaSummonsHtml(s, options = {}) {
  const officerName = options.officerName || s.officer_name || '';
  const badge = s.officer_code_badge || options.badge || '';
  const courtName = s.court_name || s.jurisdiction || s.offense_county_city || 'CITY/COUNTY OF';
  const caseNumber = s.case_number || s.summons_number || '';
  const defendantName = [s.defendant_name_last, s.defendant_name_first, s.defendant_name_middle].filter(Boolean);
  const location = s.location_of_offense || s.location || '';
  const route = s.route_street || location;
  const charge = s.violation_charge_description || s.violation_description || '';
  const hearing = [dateValue(s.hearing_date || s.court_date), s.hearing_time || s.court_time].filter(Boolean).join('  ');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Virginia Uniform Summons - ${esc(caseNumber)}</title>
  <style>
    @page summons { size: letter landscape; margin: .24in .30in .58in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: white; color: #000; font-family: Arial, Helvetica, sans-serif; }
    body { font-size: 6.45pt; line-height: 1.08; }
    .toolbar { position: fixed; left: 10px; top: 10px; z-index: 20; }
    .toolbar button { border: 0; border-radius: 5px; background: #1d4ed8; color: #fff; font-weight: 700; padding: 8px 13px; cursor: pointer; }
    .sheet { page: summons; width: 10.40in; height: 7.60in; margin: 0 auto; display: grid; grid-template-columns: 1.86in minmax(0, 1fr); gap: .10in; break-inside: avoid; overflow: hidden; }
    .waiver, .summons { border: 1.5px solid #000; }
    .waiver { padding: 5px; font-size: 5.55pt; text-align: justify; }
    .waiver h2 { text-align: center; font-size: 6.5pt; margin: 0 0 2px; }
    .waiver p { margin: 0 0 3px; }
    .sig { margin-top: 7px; border-top: 1px solid #000; padding-top: 2px; text-align: center; }
    .summons { position: relative; display: grid; grid-template-rows: auto auto 1fr auto; }
    .top { min-height: .44in; display: grid; grid-template-columns: .65in 1fr 1.15in; align-items: start; border-bottom: 1px solid #000; }
    .copy-no { font-size: 13pt; padding: 6px 5px; }
    .title { text-align: center; padding-top: 3px; }
    .title strong { display: block; font-size: 10.2pt; letter-spacing: .2px; }
    .title span { display: block; font-size: 6pt; font-weight: 700; }
    .case { padding: 3px 4px; text-align: right; }
    .case .value { min-height: 14px; border-bottom: 1px solid #000; font-size: 8pt; }
    .bodygrid { display: grid; grid-template-columns: 3.15in minmax(0, 1fr); min-height: 5.42in; }
    .left, .right { border-right: 1px solid #000; }
    .right { border-right: 0; }
    .notice { padding: 3px 5px; border-bottom: 1px solid #000; font-size: 6.2pt; }
    .courtchecks { padding: 3px 5px; border-bottom: 1px solid #000; line-height: 1.35; }
    .row { display: grid; border-bottom: 1px solid #000; }
    .row > * { border-right: 1px solid #000; }
    .row > *:last-child { border-right: 0; }
    .r2 { grid-template-columns: 1fr 1fr; }
    .r3 { grid-template-columns: 1fr 1fr 1fr; }
    .r4 { grid-template-columns: repeat(4, 1fr); }
    .r5 { grid-template-columns: .55fr .55fr 1.2fr .7fr .7fr; }
    .r6 { grid-template-columns: .55fr .55fr .7fr .65fr .65fr .65fr; }
    .field { min-height: 27px; padding: 2px 3px; }
    .field.tight { min-height: 22px; }
    .field.tall { min-height: 44px; }
    .label { font-size: 4.7pt; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
    .value { min-height: 12px; font-size: 7pt; font-weight: 600; overflow-wrap: anywhere; }
    .box { display: inline-block; width: 8px; height: 8px; line-height: 7px; text-align: center; border: 1px solid #000; font-size: 7px; font-weight: bold; vertical-align: -1px; margin-right: 2px; }
    .yesno { white-space: nowrap; font-size: 5pt; }
    .direction { display: grid; grid-template-columns: 1fr .6fr .65fr .75fr; border-bottom: 1px solid #000; }
    .direction > div { border-right: 1px solid #000; padding: 2px 3px; min-height: 31px; }
    .direction > div:last-child { border-right: 0; }
    .appearance { padding: 4px; text-align: center; border-bottom: 1px solid #000; font-weight: 700; font-size: 6pt; }
    .appearance .line { height: 13px; border-bottom: 1px solid #000; margin: 2px 12px; }
    .commercial { padding: 4px; min-height: 1.2in; font-size: 5.6pt; }
    .commercial table { width: 100%; border-collapse: collapse; }
    .commercial td { padding: 1px 2px; vertical-align: top; }
    .defsig { padding: 4px; border-top: 1px solid #000; }
    .defsig .line { height: 18px; border-bottom: 1px solid #000; }
    .instructions { border-top: 1.5px solid #000; display: grid; grid-template-columns: 2.15in 1fr; min-height: .92in; }
    .juvenile { padding: 4px; border-right: 1px solid #000; }
    .prepay { padding: 4px 6px; }
    .prepay h3 { margin: 0 0 3px; font-size: 7.5pt; text-align: center; }
    .prepay ol { margin: 0; padding-left: 15px; font-size: 5.35pt; line-height: 1.18; }
    .bottom { display: flex; justify-content: space-between; align-items: end; padding: 3px 5px; font-size: 5.2pt; font-weight: 700; }
    @media print { .toolbar { display: none !important; } .sheet { margin: 0 auto; } body { padding-bottom: 0 !important; } }
  </style>
</head>
<body class="bps-summons-print" data-no-company-footer="true">
  <div class="toolbar"><button onclick="window.close()">← Back to App</button></div>
  <main class="sheet">
    <aside class="waiver">
      <h2>WAIVER OF A TRIAL<br />(PLEA OF GUILTY)<br />BY SIGNING BELOW, I CERTIFY THAT I</h2>
      <p>HAVE READ THE NOTICE AND I AM ENTERING MY WRITTEN PLEA. I UNDERSTAND THAT I WAIVE A TRIAL, A HEARING, AND MY RIGHT TO APPEAR BEFORE THE COURT.</p>
      <p>I UNDERSTAND THE CHARGE, THE POSSIBLE PENALTIES, AND THAT A RECORD OF MY PLEA MAY BE MADE. I ALSO UNDERSTAND THAT PAYMENT MUST BE RECEIVED BY THE COURT AS DIRECTED.</p>
      <p>I HAVE READ AND UNDERSTAND ALL INSTRUCTIONS ON THIS SUMMONS AND AGREE TO COMPLY WITH THE COURT'S REQUIREMENTS.</p>
      <div class="sig">SIGNATURE</div>
      <div class="sig">DATE</div>
      <p style="margin-top:8px;font-weight:bold;">IF ACCUSED IS A JUVENILE</p>
      <p>Parent or legal guardian signature may be required by the court.</p>
      <div class="sig">SIGNATURE OF PARENT/GUARDIAN</div>
      <div class="sig">DATE</div>
      <div class="sig">NOTARY PUBLIC / CLERK / MAGISTRATE</div>
      <div class="sig">CITY/COUNTY &nbsp;&nbsp;&nbsp; STATE</div>
      <div class="sig">MY COMMISSION EXPIRES</div>
      <p style="margin-top:8px;font-size:6pt;font-weight:bold;">FOR THE EXACT PREPAY TOTAL, CONTACT THE CLERK OF THE COURT LISTED ON THIS SUMMONS.</p>
    </aside>

    <section class="summons">
      <header class="top">
        <div class="copy-no">001</div>
        <div class="title"><strong>VIRGINIA UNIFORM SUMMONS</strong><span>DEPARTMENT OF STATE POLICE</span></div>
        <div class="case"><div class="label">CASE NO.</div><div class="value">${esc(caseNumber)}</div></div>
      </header>

      <div class="bodygrid">
        <div class="left">
          <div class="notice"><strong>YOU ARE SUMMONED TO APPEAR IN THE ${esc(courtName)}</strong></div>
          <div class="courtchecks">
            <div>${check(s.court_type === 'general_district')} GENERAL DISTRICT COURT (TRAFFIC)</div>
            <div>${check(s.court_type === 'criminal')} GENERAL DISTRICT COURT (CRIMINAL)</div>
            <div>${check(s.court_type === 'juvenile_domestic')} JUVENILE &amp; DOMESTIC RELATIONS DISTRICT COURT</div>
          </div>
          <div class="row r3">
            ${field('ON / FOR VIOLATION OF', s.violation_law_section || s.violation_code, 'tight')}
            ${field('ADDRESS / COURT', s.court_location || courtName, 'tight')}
            ${field('AT', hearing, 'tight')}
          </div>
          <div class="row r2">
            ${field('LAW SECTION', s.violation_law_section || s.violation_code, 'tight')}
            ${field('DESCRIBE CHARGE', charge, 'tight')}
          </div>
          <div class="commercial">
            <table>
              <tr><td>COMMERCIAL MOTOR VEHICLE</td><td class="yesno">${check(s.cmv_yes)} YES ${check(s.cmv_no)} NO</td></tr>
              <tr><td>HAZARDOUS MATERIALS</td><td class="yesno">${check(s.hazmat_yes || s.hazmat_resulted_fatality_yes)} YES ${check(s.hazmat_no || s.hazmat_resulted_fatality_no)} NO</td></tr>
              <tr><td>RESULTED IN FATALITY</td><td class="yesno">${check(s.hazmat_resulted_fatality_yes)} YES ${check(s.hazmat_resulted_fatality_no)} NO</td></tr>
              <tr><td>HIGHWAY SAFETY CORRIDOR</td><td class="yesno">${check(s.highway_safety_corridor_yes)} YES ${check(s.highway_safety_corridor_no)} NO</td></tr>
            </table>
            <p style="margin-top:5px;"><strong>I PROMISE TO APPEAR AT THE TIME AND PLACE SHOWN ABOVE.</strong> SIGNING THIS SUMMONS IS NOT AN ADMISSION OF GUILT.</p>
          </div>
          <div class="appearance">
            YOU MUST APPEAR AT TRIAL (JUVENILES MUST APPEAR WITH PARENT/LEGAL GUARDIAN)
            <div class="line"></div>
            YOU MAY AVOID COMING TO COURT ONLY IF THIS BLOCK IS CHECKED AND ALL INSTRUCTIONS ARE FOLLOWED.
          </div>
          <div class="defsig">
            <div class="line"></div><div class="label">SIGNATURE</div>
            <div style="display:grid;grid-template-columns:1fr 2fr;gap:5px;margin-top:3px;"><div><div class="line"></div><div class="label">DATE</div></div><div><div class="line"></div><div class="label">MAILING ADDRESS IF CHANGED</div></div></div>
          </div>
        </div>

        <div class="right">
          <div class="row r3">
            ${field('NAME — LAST', defendantName[0] || '')}
            ${field('FIRST', defendantName[1] || '')}
            ${field('MIDDLE', defendantName[2] || '')}
          </div>
          <div class="row r2">${field('RES. ADDRESS', s.defendant_address)}${field('RES. JURIS.', s.residential_jurisdiction || '')}</div>
          <div class="row r3">${field('CITY/TOWN', s.defendant_city_town)}${field('STATE', s.defendant_state)}${field('ZIP', s.defendant_zip)}</div>
          <div class="row r6">
            ${field('RACE', s.defendant_race, 'tight')}${field('SEX', s.defendant_sex, 'tight')}${field('D.O.B.', dateValue(s.defendant_dob), 'tight')}${field('HT.', [s.defendant_height_ft, s.defendant_height_in].filter(v => v !== '' && v != null).join("' "), 'tight')}${field('WGT.', s.defendant_weight, 'tight')}${field('EYES / HAIR', [s.defendant_eyes, s.defendant_hair].filter(Boolean).join(' / '), 'tight')}
          </div>
          <div class="row r2">${field('DL/CDL #', s.defendant_license_no)}${field('STATE', s.defendant_dl_state || s.defendant_license_state)}</div>
          <div class="row r4">${field('VEH. YEAR', s.defendant_dl_year || s.vehicle_year, 'tight')}${field('MAKE', s.defendant_dl_make || s.vehicle_make, 'tight')}${field('TYPE', s.defendant_dl_type || s.vehicle_type, 'tight')}${field('LICENSE NO. / STATE', [s.vehicle_plate || s.defendant_license_no, s.vehicle_plate_state || s.defendant_license_state].filter(Boolean).join(' / '), 'tight')}</div>
          <div class="row r4">${field('JURIS. OF OFF.', s.jurisdiction, 'tight')}${field('DATE OF OFF.', dateValue(s.offense_date), 'tight')}${field('DAY OF WEEK', s.day_of_week, 'tight')}${field('TIME', [s.offense_time, s.offense_time_period].filter(Boolean).join(' '), 'tight')}</div>
          <div class="row r2">${field('VIOLATION OF LAW SECTION', s.violation_law_section || s.violation_code)}${field('DESCRIBE CHARGE', charge)}</div>
          <div class="direction">
            <div><div class="label">DIRECTION</div><div class="value">${esc(s.direction)}</div></div>
            <div><div class="label">ACCIDENT</div><div>${check(s.accident_yes_no === 'yes')}Y ${check(s.accident_yes_no === 'no')}N</div></div>
            <div><div class="label">WEATHER</div><div class="value">${esc(s.weather)}</div></div>
            <div><div class="label">ROUTE/STREET</div><div class="value">${esc(route)}</div></div>
          </div>
          ${field('LOCATION OF OFFENSE', location, 'tall')}
          <div class="row r2">${field('ARREST DATE', dateValue(s.arrest_date))}${field('ARREST LOCATION', s.arrest_location)}</div>
          <div class="row r2">${field('OFFICER', officerName)}${field('CODE/BADGE NO.', badge)}</div>
        </div>
      </div>

      <div class="instructions">
        <div class="juvenile">
          <strong>IF ACCUSED IS A JUVENILE</strong><br />A copy of this summons must be delivered to the parent or legal guardian as required.
          <div style="margin-top:8px;border-top:1px solid #000;padding-top:2px;">SIGNATURE OF PARENT/GUARDIAN &nbsp;&nbsp;&nbsp; DATE</div>
        </div>
        <div class="prepay">
          <h3>PRETRIAL WAIVER AND PREPAYMENT INSTRUCTIONS</h3>
          <ol><li>Contact the clerk of the court listed on this summons to confirm whether the charge is prepayable and obtain the exact prepay total.</li><li>Do not estimate the amount due. Follow the court clerk's payment instructions.</li><li>If prepayable, the court must receive payment before the trial date.</li><li>Juveniles and certain offenses may require a court appearance.</li></ol>
        </div>
      </div>
      <footer class="bottom"><span>CONTACT THE COURT CLERK FOR THE EXACT PREPAY TOTAL.</span><span>DEFENDANT'S COPY</span><span>KEEP THIS SUMMONS FOR YOUR RECORDS.</span></footer>
    </section>

  </main>
  <script>window.onload = () => setTimeout(() => window.print(), 450);</script>
</body>
</html>`;
}

export function openVirginiaSummonsPrint(summons, options = {}) {
  const printWindow = window.open('', '', 'width=1200,height=900');
  if (!printWindow) throw new Error('Pop-up blocked. Allow pop-ups to print the summons.');
  printWindow.document.write(buildVirginiaSummonsHtml(summons, options));
  printWindow.document.close();
  printWindow.focus();
}
