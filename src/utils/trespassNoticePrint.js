import { formatReportDate, formatReportDateTime, openBlackPointReport, resolveReportTimeZone } from '@/lib/reportPrint';

const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

export function resolvePoliceDepartment(location = {}) {
  const haystack = [location.site_name,location.address,location.subdivision,location.division,location.city,location.county].filter(Boolean).join(' ').toLowerCase();
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
  return String(location.division || '').toLowerCase().includes('maryland') ? 'the local Maryland law-enforcement agency' : 'the local law-enforcement agency';
}

function openVirginiaNotice(notice, options = {}) {
  const win = window.open('', '', 'width=950,height=1050');
  if (!win) return;
  const loc = options.locationRecord || {};
  const subjectName = notice.subject_name || [notice.subject_first_name, notice.subject_middle_name, notice.subject_last_name].filter(Boolean).join(' ');
  const subjectCityLine = [notice.subject_city, notice.subject_state, notice.subject_zip].filter(Boolean).join(', ');
  const propertyAddress = options.propertyAddress || loc.address || notice.location || '';
  const propertyCityLine = [loc.city, loc.state || 'VA', loc.zip_code || loc.zip].filter(Boolean).join(', ');
  const officerPrinted = options.signatureName || options.officerName || '';
  const date = notice.notice_date ? new Date(notice.notice_date) : new Date();
  const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
  const year = Number.isNaN(date.getTime()) ? '' : date.getFullYear();
  const sig = (url, label) => `<div class="sigbox">${url ? `<img src="${esc(url)}" alt="${esc(label)}"/>` : ''}</div><div class="siglabel">${esc(label)}</div>`;

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Notice of No Trespass - ${esc(subjectName)}</title><style>
  @page{size:8.5in 11in;margin:.45in}.no-print{position:fixed;top:10px;left:10px;background:#111827;color:white;border:0;border-radius:5px;padding:8px 12px;font:600 13px Arial;z-index:5}@media print{.no-print{display:none!important}}*{box-sizing:border-box}body{margin:0;background:white;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:9.2pt}.sheet{max-width:7.55in;margin:0 auto}.title{text-align:center;font-size:20pt;font-weight:800;text-decoration:underline;margin:18px 0 24px}.row{display:grid;grid-template-columns:1.55in 1fr;gap:8px;align-items:end;margin:7px 0}.label{font-weight:800;text-decoration:underline}.line{border-bottom:1px solid #000;min-height:20px;padding:2px 5px}.hint{font-size:7.5pt;font-weight:700;margin-left:5px}.warn{font-style:italic;font-weight:800;text-decoration:underline;line-height:1.25;margin:22px 0 12px}.section{font-weight:800;font-style:italic;text-decoration:underline;margin:20px 0 10px}.legal{font-size:8.5pt;line-height:1.22;text-align:justify;margin:0 0 14px}.reason{border:1px solid #000;padding:8px;margin:12px 0;font-size:8.5pt}.signrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:18px}.sigbox{height:48px;border-bottom:1px solid #000;display:flex;align-items:end;justify-content:center}.sigbox img{max-height:46px;max-width:100%;object-fit:contain}.siglabel{text-align:center;font-size:7.3pt;font-weight:700;margin-top:2px}.printed{margin-top:12px}.note{margin-top:18px;font-size:7.5pt;font-weight:700}.small{font-size:7.8pt}.datesig{display:grid;grid-template-columns:2.2fr .7fr .7fr .8fr;gap:8px;align-items:end;margin-top:18px}
  </style></head><body><button class="no-print" onclick="window.close()">Back to App</button><div class="sheet">
  <div class="title">NOTICE OF NO TRESPASS</div>
  <div class="row"><div class="label">TO BE SERVED ON:</div><div class="line">${esc(subjectName)} <span class="hint">(PRINT NAME HERE)</span></div></div>
  <div class="row"><div></div><div class="line">${esc(notice.subject_address || '')} <span class="hint">(PRINT STREET ADDRESS HERE)</span></div></div>
  <div class="row"><div></div><div class="line">${esc(subjectCityLine)} <span class="hint">(PRINT CITY, STATE, ZIPCODE HERE)</span></div></div>
  <div class="row"><div></div><div class="line">${esc(notice.subject_phone || '')} <span class="hint">(PRINT TELEPHONE NUMBER HERE)</span></div></div>

  <div class="warn">YOU ARE HEREBY NOTIFIED NOT TO CONTACT THE PETITIONER OF THIS NOTICE FOR<br/>ANY REASON OR TRESPASS UPON HIS/HER PROPERTY LOCATED AT:</div>
  <div class="row"><div></div><div class="line">${esc(propertyAddress)} <span class="hint">(PRINT STREET ADDRESS HERE)</span></div></div>
  <div class="row"><div></div><div class="line">${esc(propertyCityLine)} <span class="hint">(PRINT CITY, STATE, ZIPCODE HERE)</span></div></div>

  <div class="section">AT ANY TIME.</div>
  <p class="legal">IF ANY PERSON WITHOUT AUTHORITY OF LAW GOES UPON OR REMAINS UPON THE LANDS, BUILDINGS OR PREMISES OF ANOTHER, OR ANY PORTION OR AREA THEREOF, AFTER HAVING BEEN FORBIDDEN TO DO SO, WHETHER ORALLY OR IN WRITING, BY THE OWNER, LESSEE, CUSTODIAN OR OTHER PERSON LAWFULLY IN CHARGE, SUCH PERSON MAY BE SUBJECT TO PROSECUTION PURSUANT TO § 18.2-119 CODE OF VIRGINIA, AS AMENDED.</p>
  <div class="warn">YOU ARE FURTHER NOTIFIED NOT TO ATTEMPT TO CONTACT THE PETITIONER NAMED<br/>BELOW BY TELEPHONE AT ANY TIME.</div>
  <p class="legal">OBSCENE, VULGAR, PROFANE, LEWD, LASCIVIOUS, INDECENT, THREATENING, INTIMIDATING, OR HARASSING TELEPHONE OR ELECTRONIC COMMUNICATIONS MAY BE PROSECUTED UNDER APPLICABLE VIRGINIA LAW, INCLUDING § 18.2-427 AND § 18.2-429, AS AMENDED.</p>
  <p class="legal">PHYSICAL CONTACT OR VERBAL EXCHANGES MADE WITH THE INTENT TO HARASS, THREATEN, INTIMIDATE OR CAUSE PHYSICAL HARM WILL NOT BE TOLERATED AND MAY BE PROSECUTED TO THE FULLEST EXTENT OF THE LAW.</p>
  <div class="warn">YOU SHALL NOT SEEK OUT THE PETITIONER OF THIS NOTICE WITH THE INTENT TO<br/>CAUSE DURESS AT ANY TIME.</div>
  <p class="legal"><strong>THIS NOTICE SHALL REMAIN IN FULL FORCE AND EFFECT UNTIL SUCH TIME AS THE PETITIONER WITHDRAWS THIS NOTICE OR OTHERWISE RENDERS IT INVALID.</strong></p>
  <div class="reason"><strong>REASON FOR NOTICE:</strong> ${esc(notice.reason || '')}${notice.linked_call_number ? `<br/><strong>C A D:</strong> ${esc(notice.linked_call_number)}` : ''}</div>

  <div class="datesig"><div class="line">${notice.officer_signature_url || notice.signature_url ? `<img src="${esc(notice.officer_signature_url || notice.signature_url)}" style="max-height:38px;max-width:100%;object-fit:contain"/>` : ''}</div><div class="small">THIS</div><div class="line">${esc(dateText)}</div><div class="small">${esc(String(year))}</div></div>
  <div class="printed"><strong>PETITIONER / AUTHORIZED AGENT PRINTED NAME:</strong> <span style="border-bottom:1px solid #000;padding:0 8px">${esc(officerPrinted)}</span></div>
  <div class="signrow"><div>${sig(notice.witness_signature_url,'WITNESS SIGNATURE')}<div class="small" style="text-align:center;margin-top:3px">${esc(notice.witness_name || '')}</div></div><div>${sig(notice.subject_signature_url,'SUBJECT SIGNATURE / ACKNOWLEDGMENT')}<div class="small" style="text-align:center;margin-top:3px">${esc(subjectName)}</div></div><div>${sig(notice.officer_signature_url || notice.signature_url,'AUTHORIZED AGENT SIGNATURE')}<div class="small" style="text-align:center;margin-top:3px">${esc(officerPrinted)}</div></div></div>
  <div class="note">NOTE: ONE RECIPIENT PER NOTICE. Subject and witness signature areas remain available even if a person declines or is unavailable to sign.</div>
  </div><script>window.onload=()=>setTimeout(()=>window.print(),350)</script></body></html>`);
  win.document.close(); win.focus(); return win;
}

function joinSubjectAddress(notice) { return [notice.subject_address,[notice.subject_city,notice.subject_state,notice.subject_zip].filter(Boolean).join(', ')].filter(Boolean).join('\n'); }

export function openTrespassNoticePrint(notice, options = {}) {
  const jurisdiction = String(options.jurisdiction || 'VA').toUpperCase();
  if (jurisdiction === 'VA') return openVirginiaNotice(notice, options);
  const locationRecord = options.locationRecord || {};
  const timeZone = resolveReportTimeZone(locationRecord, options.timeZone || 'America/New_York');
  const propertyName = options.propertyName || notice.location || 'Not recorded';
  const propertyAddress = options.propertyAddress || locationRecord.address || notice.location || 'Not recorded';
  const officerName = options.officerName || 'Officer';
  const policeDepartment = options.policeDepartment || resolvePoliceDepartment({...locationRecord,division:locationRecord.division || 'Maryland'});
  const signedAt = notice.officer_signed_at || notice.created_date || notice.notice_date;
  const expiration = notice.expiration_date ? formatReportDate(notice.expiration_date, timeZone) : '';
  const photos = [...(Array.isArray(notice.photo_urls)?notice.photo_urls:[]),notice.photo_url,notice.id_photo].filter(Boolean);
  return openBlackPointReport({title:'MD Trespass Notice',subtitle:'Official No-Trespassing Warning',reportNumber:notice.police_report_number || notice.id || '',status:notice.status || 'active',timeZone,meta:[{label:'Issued',value:formatReportDateTime(notice.notice_date,timeZone)},{label:'Property',value:propertyName},{label:'Duration',value:notice.duration || 'Permanent'}],sections:[{title:'Property and Notice',fields:[{label:'Property Address',value:propertyAddress,wide:true},{label:'Expiration',value:expiration || 'Permanent'},{label:'Police Department',value:policeDepartment}]},{title:'Subject Information',fields:[{label:'Subject Name',value:notice.subject_name},{label:'Current Address',value:joinSubjectAddress(notice),wide:true},{label:'Physical Description',value:notice.subject_description,wide:true}]},{title:'Reason and Legal Warning',fields:[{label:'Reason for Notice',value:notice.reason,wide:true,breakable:true},{label:'Legal Warning',value:`The subject is forbidden from entering or remaining on the property. Returning after notice may result in arrest and prosecution under applicable Maryland trespass law. ${policeDepartment} will be contacted when enforcement is required.`,wide:true,breakable:true}]}],officer:{name:officerName,signatureName:options.signatureName || officerName,badge:options.badge || '',unit:options.unit || '',ip:notice.officer_ip_address || ''},signedAt,signatureUrl:notice.officer_signature_url || notice.signature_url || '',photos,footerNote:'Official trespass notice retained in Pathfinder.'});
}
