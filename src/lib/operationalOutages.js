export const isOperationalOutage = issue => !(
 String(issue?.issue_key||'').includes('scan:rate-limited') ||
 (issue?.source==='full_app_scan' && /scan.*paused.*throttl/i.test(String(issue?.title||'')))
);
