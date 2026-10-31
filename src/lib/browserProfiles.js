export const BROWSER_PROFILE_OPTIONS = [
  {
    value: 'strict_search',
    label: 'Strict search only',
    summary: 'Approved search results are visible, but no external website can be opened.',
  },
  {
    value: 'work_research',
    label: 'Work research',
    summary: 'Research, legal, regulatory and reference websites. Shopping, social, streaming and entertainment blocked.',
  },
  {
    value: 'limited_business',
    label: 'Limited business access',
    summary: 'Approved business tools and research, with entertainment, shopping and personal accounts blocked.',
  },
  {
    value: 'admin_access',
    label: 'Administrator access',
    summary: 'Unrestricted research and administration browsing. Malicious and phishing destinations stay blocked.',
  },
];

export const BROWSER_CATEGORY_OPTIONS = [
  { key: 'social', label: 'Social media' },
  { key: 'streaming', label: 'Video streaming' },
  { key: 'music', label: 'Music streaming' },
  { key: 'shopping', label: 'Shopping & retail' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'adult', label: 'Adult content' },
  { key: 'gambling', label: 'Gambling & betting' },
  { key: 'dating', label: 'Dating' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'downloads', label: 'Software downloads' },
  { key: 'vpn_proxy', label: 'VPN & proxy' },
  { key: 'ai', label: 'External AI services' },
  { key: 'file_sharing', label: 'File sharing' },
  { key: 'advertising', label: 'Advertising & redirects' },
  { key: 'malicious', label: 'Malicious & phishing' },
];

const CATEGORY_LABELS = BROWSER_CATEGORY_OPTIONS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});

export function browserCategoryLabel(key) {
  if (!key) return 'Uncategorized';
  return CATEGORY_LABELS[key] || key;
}

export function profileLabel(profile) {
  return BROWSER_PROFILE_OPTIONS.find(item => item.value === profile)?.label || 'Strict search only';
}

export function profileTone(profile) {
  if (profile === 'admin_access') return 'border-amber-600/70 bg-amber-500/10 text-amber-200';
  if (profile === 'limited_business') return 'border-emerald-600/70 bg-emerald-500/10 text-emerald-200';
  if (profile === 'work_research') return 'border-cyan-600/70 bg-cyan-500/10 text-cyan-200';
  return 'border-slate-600 bg-slate-800 text-slate-200';
}

export function defaultPolicyFor(profile) {
  const blocked = BROWSER_CATEGORY_OPTIONS.map(item => item.key);
  if (profile === 'admin_access') {
    return { blocked_categories: ['malicious'], strict_search_only: false, allow_downloads: true, allow_print: true, allow_clipboard: true, allow_devtools: true, session_timeout_minutes: 60 };
  }
  if (profile === 'limited_business') {
    return {
      blocked_categories: blocked.filter(key => !['social', 'shopping'].includes(key)),
      strict_search_only: false,
      allow_downloads: false,
      allow_print: true,
      allow_clipboard: true,
      allow_devtools: false,
      session_timeout_minutes: 45,
    };
  }
  if (profile === 'work_research') {
    return { blocked_categories: blocked, strict_search_only: false, allow_downloads: false, allow_print: true, allow_clipboard: true, allow_devtools: false, session_timeout_minutes: 30 };
  }
  return { blocked_categories: blocked.filter(key => key !== 'ai'), strict_search_only: true, allow_downloads: false, allow_print: false, allow_clipboard: false, allow_devtools: false, session_timeout_minutes: 15 };
}

export function splitDomainList(value) {
  return [...new Set(String(value || '')
    .split(/[\s,;]+/)
    .map(item => item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
    .filter(Boolean))];
}

export function normaliseDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .replace(/^www\./, '')
    .replace(/:\d+$/, '');
}