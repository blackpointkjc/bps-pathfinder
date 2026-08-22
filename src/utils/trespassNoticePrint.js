import {
  formatReportDate,
  formatReportDateTime,
  openBlackPointReport,
  resolveReportTimeZone,
} from '@/lib/reportPrint';

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

function joinSubjectAddress(notice) {
  return [
    notice.subject_address,
    [notice.subject_city, notice.subject_state, notice.subject_zip].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n');
}

export function openTrespassNoticePrint(notice, options = {}) {
  const jurisdiction = String(options.jurisdiction || 'VA').toUpperCase();
  const locationRecord = options.locationRecord || {};
  const timeZone = resolveReportTimeZone(locationRecord, options.timeZone || 'America/New_York');
  const propertyName = options.propertyName || notice.location || 'Not recorded';
  const propertyAddress = options.propertyAddress || locationRecord.address || notice.location || 'Not recorded';
  const officerName = options.officerName || 'Officer';
  const policeDepartment = options.policeDepartment || resolvePoliceDepartment({
    ...locationRecord,
    division: locationRecord.division || (jurisdiction === 'MD' ? 'Maryland' : 'Virginia'),
  });
  const signedAt = notice.officer_signed_at || notice.created_date || notice.notice_date;
  const expiration = notice.expiration_date ? formatReportDate(notice.expiration_date, timeZone) : '';
  const legalWarning = jurisdiction === 'MD'
    ? `The subject is forbidden from entering or remaining on the property. Returning after notice may result in arrest and prosecution under applicable Maryland trespass law. ${policeDepartment} will be contacted when enforcement is required.`
    : `The subject is forbidden from entering or remaining on the property. Returning after notice may result in arrest and prosecution under Virginia Code § 18.2-119. ${policeDepartment} will be contacted when enforcement is required.`;
  const photos = [
    ...(Array.isArray(notice.photo_urls) ? notice.photo_urls : []),
    notice.photo_url,
    notice.id_photo,
  ].filter(Boolean);

  return openBlackPointReport({
    title: `${jurisdiction} Trespass Notice`,
    subtitle: 'Official No-Trespassing Warning',
    reportNumber: notice.police_report_number || notice.id || '',
    status: notice.status || 'active',
    timeZone,
    meta: [
      { label: 'Issued', value: formatReportDateTime(notice.notice_date, timeZone) },
      { label: 'Property', value: propertyName },
      { label: 'Duration', value: notice.duration || 'Permanent' },
    ],
    sections: [
      {
        title: 'Property and Notice',
        fields: [
          { label: 'Property Address', value: propertyAddress, wide: true },
          { label: 'Expiration', value: expiration || 'Permanent' },
          { label: 'Police Notified', value: notice.police_notified ? 'Yes' : 'No' },
          { label: 'Police Department', value: policeDepartment },
          { label: 'Police Report Number', value: notice.police_report_number },
        ],
      },
      {
        title: 'Subject Information',
        fields: [
          { label: 'Subject Name', value: notice.subject_name },
          { label: 'Identification Number', value: notice.subject_id },
          { label: 'Current Address', value: joinSubjectAddress(notice), wide: true },
          { label: 'Physical Description', value: notice.subject_description, wide: true },
          { label: 'Vehicle Information', value: notice.vehicle_info, wide: true },
        ],
      },
      {
        title: 'Reason and Legal Warning',
        fields: [
          { label: 'Reason for Notice', value: notice.reason, wide: true, breakable: true },
          { label: 'Legal Warning', value: legalWarning, wide: true, breakable: true },
        ],
      },
      {
        title: 'Service and Acknowledgment',
        fields: [
          { label: 'Notice Served By', value: notice.police_notified ? policeDepartment : officerName },
          { label: 'Served Date', value: formatReportDateTime(notice.notice_date, timeZone) },
          { label: 'Witness', value: notice.witness_name },
          { label: 'Witness Signed', value: notice.witness_signed_at ? formatReportDateTime(notice.witness_signed_at, timeZone) : '' },
          { label: 'Subject Acknowledgment', value: notice.subject_signature_url ? 'Signature captured' : 'Not captured' },
          { label: 'Subject Signed', value: notice.subject_signed_at ? formatReportDateTime(notice.subject_signed_at, timeZone) : '' },
        ],
      },
    ],
    officer: {
      name: officerName,
      signatureName: options.signatureName || officerName,
      badge: options.badge || '',
      unit: options.unit || '',
      ip: notice.officer_ip_address || '',
    },
    signedAt,
    signatureUrl: notice.officer_signature_url || notice.signature_url || '',
    photos,
    footerNote: 'Official trespass notice retained in Pathfinder.',
  });
}
