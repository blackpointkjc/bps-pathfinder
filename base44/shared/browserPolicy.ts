// Company browser policy engine shared by browserAccessCheck and browserSearch.
// Plain JavaScript in a .ts module (Deno runtime).

export const BROWSER_CATEGORIES = [
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

export const CATEGORY_LABELS = BROWSER_CATEGORIES.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});

const CATEGORY_DOMAINS = {
  social: [
    'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'snapchat.com',
    'reddit.com', 'linkedin.com', 'pinterest.com', 'tumblr.com', 'threads.net', 'discord.com',
    'telegram.org', 'whatsapp.com', 'wechat.com', 'quora.com', 'nextdoor.com', 'bsky.app',
    'mastodon.social', 'vk.com', 'flickr.com', 'imgur.com', '9gag.com', 'tinder.com',
    'facebook.net', 'fb.com', 'fbcdn.net', 'messenger.com', 'instagram.net', 'cdninstagram.com',
    'tiktokcdn.com', 'tiktokv.com', 'byteoversea.com', 'snapkit.com', 'snap.com',
    'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media', 'redditmedia.com', 'redd.it',
  ],
  streaming: [
    'youtube.com', 'youtu.be', 'netflix.com', 'hulu.com', 'disneyplus.com', 'max.com',
    'hbomax.com', 'primevideo.com', 'peacocktv.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com',
    'paramountplus.com', 'tubitv.com', 'plex.tv', 'roku.com', 'crunchyroll.com', 'fubo.tv',
    'sling.com', 'pluto.tv', 'kick.com',
    'youtube-nocookie.com', 'youtubei.googleapis.com', 'googlevideo.com', 'ytimg.com', 'yt3.ggpht.com',
    'youtube.googleapis.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
    'netflix.net', 'nflxvideo.net', 'nflximg.net', 'nflxso.net', 'huluim.com',
    'huluad.com', 'disney-plus.net', 'dssott.com', 'dssott.com', 'disneyplus.disney.com',
    'primevideo.com', 'amazonvideo.com', 'aiv-cdn.net', 'twitchcdn.net', 'ttvnw.net',
    'vimeocdn.com', 'vimeo.com', 'streamable.com', 'rumble.com', 'rumble.cloud',
    'bilibili.com', 'dailymotion.com', 'cdn.jwplayer.com', 'jwplayer.com',
  ],
  music: [
    'spotify.com', 'music.apple.com', 'soundcloud.com', 'pandora.com', 'deezer.com',
    'tidal.com', 'iheart.com', 'audacy.com', 'last.fm', 'bandcamp.com', 'audiomack.com',
    'scdn.co', 'spotifycdn.com', 'spotifycdn.net', 'audio-ak-spotify-com.akamaized.net',
    'podcasts.apple.com', 'music.amazon.com', 'music.youtube.com',
  ],
  shopping: [
    'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'etsy.com', 'temu.com', 'shein.com',
    'aliexpress.com', 'alibaba.com', 'bestbuy.com', 'costco.com', 'homedepot.com', 'lowes.com',
    'wayfair.com', 'wish.com', 'poshmark.com', 'mercari.com', 'newegg.com', 'kohls.com',
    'macys.com', 'nordstrom.com', 'ikea.com', 'chewy.com', 'overstock.com', 'qvc.com',
    'zappos.com', 'gap.com', 'oldnavy.com', 'nike.com', 'adidas.com', 'sephora.com',
  ],
  gaming: [
    'steampowered.com', 'steamcommunity.com', 'epicgames.com', 'roblox.com', 'minecraft.net',
    'ea.com', 'playstation.com', 'xbox.com', 'nintendo.com', 'riotgames.com', 'itch.io',
    'kongregate.com', 'miniclip.com', 'poki.com', 'coolmathgames.com', 'chess.com', 'g2a.com',
    'ign.com', 'gamespot.com', 'battle.net', 'ubisoft.com', 'rockstargames.com',
  ],
  adult: [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com',
    'onlyfans.com', 'chaturbate.com', 'stripchat.com', 'brazzers.com', 'literotica.com',
    'adultfriendfinder.com', 'spankbang.com', 'eporner.com', 'fapello.com',
    'fansly.com', 'manyvids.com', 'bongacams.com', 'livejasmin.com', 'cam4.com',
    'youjizz.com', 'tnaflix.com', 'tube8.com', 'beeg.com', 'rule34.xxx', 'nhentai.net',
  ],
  gambling: [
    'draftkings.com', 'fanduel.com', 'betmgm.com', 'caesars.com', 'bet365.com', 'bovada.lv',
    'pokerstars.com', '888casino.com', 'betrivers.com', 'pointsbet.com', 'wynnbet.com',
    'mybookie.ag', 'chumba.net', 'luckylandslots.com', 'sportsbetting.ag', 'betway.com',
  ],
  dating: [
    'tinder.com', 'bumble.com', 'hinge.co', 'match.com', 'okcupid.com', 'plentyoffish.com',
    'pof.com', 'badoo.com', 'zoosk.com', 'eharmony.com', 'ashleymadison.com', 'grindr.com',
    'silverdaddies.com', 'seeking.com',
  ],
  personal_email: [
    'mail.google.com', 'gmail.com', 'mail.yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
    'protonmail.com', 'proton.me', 'icloud.com', 'mail.com', 'gmx.com', 'yandex.com',
    'tutanota.com', 'fastmail.com', 'zoho.com', 'hushmail.com',
  ],
  downloads: [
    'filehippo.com', 'softonic.com', 'download.cnet.com', 'filehorse.com', 'apkpure.com',
    'apkmirror.com', 'uptodown.com', 'softpedia.com', 'fosshub.com', 'majorgeeks.com',
  ],
  vpn_proxy: [
    'nordvpn.com', 'expressvpn.com', 'surfshark.com', 'cyberghostvpn.com',
    'privateinternetaccess.com', 'tunnelbear.com', 'hide.me', 'hotspotshield.com',
    'windscribe.com', 'protonvpn.com', 'mullvad.net', 'proxysite.com', 'kproxy.com',
    'croxyproxy.com', '4everproxy.com', 'anonymouse.org', 'zend2.com', 'whoer.net',
    'torproject.org', 'psiphon.ca', 'ultrasurf.us', 'hola.org',
  ],
  ai: [
    'chatgpt.com', 'chat.openai.com', 'openai.com', 'claude.ai', 'anthropic.com',
    'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'perplexity.ai',
    'midjourney.com', 'character.ai', 'poe.com', 'grok.com', 'huggingface.co', 'deepseek.com',
    'mistral.ai', 'groq.com', 'jasper.ai', 'writesonic.com',
  ],
  file_sharing: [
    'dropbox.com', 'drive.google.com', 'onedrive.live.com', 'mega.nz', 'mediafire.com',
    'wetransfer.com', '4shared.com', 'rapidgator.net', 'sendspace.com', 'file.io',
    'transfer.sh', 'pcloud.com', 'terabox.com', 'gofile.io', 'anonfiles.com',
  ],
  advertising: [
    'doubleclick.net', 'googleadservices.com', 'adservice.google.com', 'taboola.com',
    'outbrain.com', 'popads.net', 'propellerads.com', 'adf.ly', 'popcash.net', 'revcontent.com',
  ],
  malicious: [
    'free-giftcards-now.com', 'account-verify-secure.com', 'login-security-check.com',
    'invoice-payment-portal.net', 'cryptofreegiveaway.io',
  ],
};

// Reference, government, legal, safety, education and business-tooling sources that
// are pre-approved for work research. Suffix matching means every *.gov and *.edu
// subdomain is covered by the short entries below.
export const RESEARCH_DOMAINS = [
  'gov', 'mil', 'edu', 'gov.uk', 'gc.ca',
  'wikipedia.org', 'wikimedia.org', 'britannica.com', 'worldcat.org', 'archive.org',
  'law.cornell.edu', 'oyez.org', 'justia.com', 'findlaw.com', 'nolo.com', 'courtlistener.com',
  'vacourts.gov', 'virginia.gov', 'dpor.virginia.gov', 'dss.virginia.gov', 'vsp.virginia.gov',
  'osha.gov', 'bls.gov', 'census.gov', 'weather.gov', 'nws.noaa.gov', 'cdc.gov', 'nih.gov',
  'nfpa.org', 'asisonline.org', 'asis.org', 'iapsc.org', 'aspanet.org',
  'microsoft.com', 'learn.microsoft.com', 'support.microsoft.com', 'office.com',
  'workspace.google.com', 'apple.com', 'support.apple.com', 'adobe.com', 'ibm.com',
  'cisco.com', 'oracle.com', 'dell.com', 'hp.com', 'lenovo.com', 'samsung.com',
  'quickbooks.intuit.com', 'intuit.com', 'adp.com', 'paychex.com', 'gusto.com',
  'docusign.com', 'adp.com', 'irs.gov', 'ssa.gov', 'usps.com',
  'github.com', 'gitlab.com', 'stackoverflow.com', 'developer.mozilla.org', 'python.org',
  'nodejs.org', 'npmjs.com', 'postgresql.org', 'mongodb.com', 'w3.org',
];

// Non-negotiable company-wide categories: preloaded for ALL non-admin employees.
// Explicit allowlist rules and temporary grants do not override these categories.
// Use actual Admin role to maintain the Website Restrictions administration UI.
export const MANDATORY_NON_ADMIN_CATEGORIES = Object.freeze([
  'social', 'streaming', 'music', 'adult', 'gaming', 'gambling', 'dating',
  'vpn_proxy', 'file_sharing', 'shopping', 'advertising', 'malicious',
]);

export const MANDATORY_NON_ADMIN_DOMAINS = Object.freeze([
  ...CATEGORY_DOMAINS.social,
  ...CATEGORY_DOMAINS.streaming,
  ...CATEGORY_DOMAINS.music,
  ...CATEGORY_DOMAINS.adult,
  ...CATEGORY_DOMAINS.gaming,
  ...CATEGORY_DOMAINS.gambling,
  ...CATEGORY_DOMAINS.dating,
  ...CATEGORY_DOMAINS.vpn_proxy,
  ...CATEGORY_DOMAINS.file_sharing,
  ...CATEGORY_DOMAINS.shopping,
  ...CATEGORY_DOMAINS.advertising,
  ...CATEGORY_DOMAINS.malicious,
]);

export const SEARCH_ENGINE_LABEL = 'Pathfinder Approved Search';

export function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.split('/')[0].split('?')[0].split('#')[0];
  value = value.replace(/^www\./, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return value;
}

export function extractDomain(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    return normalizeDomain(parsed.hostname);
  } catch {
    return normalizeDomain(raw);
  }
}

export function matchesDomain(domain, entry) {
  const target = normalizeDomain(domain);
  const candidate = normalizeDomain(String(entry || '').replace(/^\*\./, ''));
  if (!target || !candidate) return false;
  if (target === candidate) return true;
  return target.endsWith(`.${candidate}`);
}

function longestMatch(target, entries = []) {
  let found = '';
  for (const entry of entries) {
    if (matchesDomain(target, entry) && normalizeDomain(entry).length > found.length) {
      found = normalizeDomain(entry);
    }
  }
  return found;
}

// Returns the most specific category for a domain. The longest matching entry wins,
// so an explicitly listed subdomain beats its parent domain.
export function detectCategory(domain) {
  const target = normalizeDomain(domain);
  if (!target) return '';
  let category = '';
  let bestLength = 0;
  for (const [key, domains] of Object.entries(CATEGORY_DOMAINS)) {
    const matched = longestMatch(target, domains);
    if (matched && matched.length > bestLength) {
      bestLength = matched.length;
      category = key;
    }
  }
  return category;
}

export function isResearchDomain(domain) {
  return Boolean(longestMatch(normalizeDomain(domain), RESEARCH_DOMAINS));
}

export function profileDefaults(profile) {
  const blockingAll = ['social', 'streaming', 'music', 'shopping', 'gaming', 'adult', 'gambling', 'dating', 'personal_email', 'downloads', 'vpn_proxy', 'file_sharing', 'advertising', 'malicious'];
  if (profile === 'admin_access') {
    return { blocked_categories: ['malicious'], strict_search_only: false, allow_downloads: true, allow_print: true, allow_clipboard: true, allow_devtools: true, session_timeout_minutes: 60 };
  }
  if (profile === 'limited_business') {
    return { blocked_categories: ['streaming', 'music', 'gaming', 'adult', 'gambling', 'dating', 'personal_email', 'downloads', 'vpn_proxy', 'file_sharing', 'advertising', 'malicious'], strict_search_only: false, allow_downloads: false, allow_print: true, allow_clipboard: true, allow_devtools: false, session_timeout_minutes: 45 };
  }
  if (profile === 'work_research') {
    return { blocked_categories: blockingAll, strict_search_only: false, allow_downloads: false, allow_print: true, allow_clipboard: true, allow_devtools: false, session_timeout_minutes: 30 };
  }
  return { blocked_categories: blockingAll, strict_search_only: true, allow_downloads: false, allow_print: false, allow_clipboard: false, allow_devtools: false, session_timeout_minutes: 15 };
}

// Browser privileges are derived from the employee account's existing Pathfinder
// roles, not a second per-employee browser role database.
export function resolvePolicy(policies = [], user = {}) {
  const active = policies.filter(item => item && item.active !== false);
  const roles = new Set([user.role, ...(Array.isArray(user.additional_roles) ? user.additional_roles : [])]
    .filter(Boolean).map(role => String(role).trim().toLowerCase()));

  // These roles are maintained in Manage Company Employees / Accounts & Access.
  // Higher privileges take precedence even if an employee is also an Officer.
  // Only the real Admin role bypasses mandatory internet restrictions.
  const isAdmin = String(user.role || '').trim().toLowerCase() === 'admin';
  const isManagement = roles.has('full_access') || roles.has('supervisor') || roles.has('hr') || roles.has('human_resources') || roles.has('human resources');
  const isOfficer = roles.has('officer');
  const profile = isAdmin ? 'admin_access'
    : isManagement ? 'limited_business'
    : isOfficer ? 'work_research'
    : 'strict_search';
  const display = {
    admin_access: 'Administrator Access',
    limited_business: 'Limited Business Access',
    work_research: 'Officer Work Research',
    strict_search: 'Strict Search Only',
  };
  const basis = 'Manage Company Employees · ' + (isAdmin ? 'Administrator role override'
    : isManagement ? 'Supervisor / HR role override'
    : isOfficer ? 'Officer role' : 'Default employee role');

  // Restriction settings can be edited in Browser Control, but a mismatched
  // profile attached to an Officer role cannot downgrade a Supervisor or Admin.
  const configured = active.find(item => item.profile === profile &&
    (item.assigned_roles || []).some(role => roles.has(String(role).trim().toLowerCase())));
  const defaults = profileDefaults(profile);
  const policy = configured
    ? { ...defaults, ...configured, name: configured.name || display[profile], profile }
    : { ...defaults, name: display[profile], profile, active: true, safe_search: !isAdmin };
  if (isAdmin) {
    // An administrator's profile is never downgraded by a conflicting policy.
    return { policy: { ...defaults, name: display.admin_access,
      profile: 'admin_access', active: true, safe_search: false }, basis };
  }
  return { policy, basis };
}

export function policySummary(policy) {
  if (!policy) {
    return {
      name: 'No profile assigned',
      profile: 'strict_search',
      basis: 'No profile assigned',
      blocked_categories: [],
      strict_search_only: true,
      safe_search: true,
      allow_downloads: false,
      allow_print: false,
      allow_clipboard: false,
      allow_devtools: false,
      session_timeout_minutes: 15,
    };
  }
  return {
    id: policy.id,
    name: policy.name || 'Browser profile',
    profile: policy.profile || 'strict_search',
    description: policy.description || '',
    blocked_categories: policy.blocked_categories || [],
    strict_search_only: policy.strict_search_only !== false,
    safe_search: policy.safe_search !== false,
    allow_downloads: Boolean(policy.allow_downloads),
    allow_print: Boolean(policy.allow_print),
    allow_clipboard: Boolean(policy.allow_clipboard),
    allow_devtools: Boolean(policy.allow_devtools),
    session_timeout_minutes: Number(policy.session_timeout_minutes) || 30,
  };
}

function activeRulesFor(siteRules, target, user, now) {
  const email = String(user.email || '').toLowerCase();
  const roles = new Set([user.role, ...(Array.isArray(user.additional_roles) ? user.additional_roles : [])]
    .filter(Boolean)
    .map(role => String(role).toLowerCase()));
  return siteRules
    .filter(rule => {
      if (!rule || rule.active === false) return false;
      if (rule.expires_at && new Date(rule.expires_at).getTime() <= now) return false;
      if (!matchesDomain(target, rule.domain)) return false;
      if (rule.scope === 'user') return String(rule.user_email || '').toLowerCase() === email;
      if (rule.scope === 'role') return roles.has(String(rule.role || '').toLowerCase());
      return true;
    })
    .sort((a, b) => String(b.domain || '').length - String(a.domain || '').length);
}

export function evaluateDomain({ domain, policy, siteRules = [], grants = [], user = {}, now = Date.now() }) {
  const target = normalizeDomain(domain);
  const category = detectCategory(target);
  const categoryLabel = CATEGORY_LABELS[category] || 'Uncategorized';
  const rules = activeRulesFor(siteRules, target, user, now);
  const blockRule = rules.find(rule => rule.rule_type === 'block');
  const allowRule = rules.find(rule => rule.rule_type === 'allow');
  const grant = grants
    .filter(item => item && item.domain && matchesDomain(target, item.domain))
    .sort((a, b) => String(b.domain || '').length - String(a.domain || '').length)[0];

  if (!target) {
    return { allowed: false, category, category_label: categoryLabel, reason: 'Enter a valid website address.' };
  }
  // Only verified Admin employee accounts bypass mandatory browsing categories.
  // This is a browser access decision, not a way around third-party frame policies.
  if (policy?.profile === 'admin_access') {
    return { allowed: true, category, category_label: categoryLabel,
      reason: 'Unrestricted browsing permitted by the company Admin role.',
      basis: 'Company administrator role' };
  }
  // Mandatory categories are evaluated before individually approved sites,
  // temporary requests, or the person's configurable role policy. This means
  // non-admin users cannot bypass company-wide social/streaming/adult blocks.
  // Only a verified Admin account receives a bypass; Full Access alone does not.
  if (category && MANDATORY_NON_ADMIN_CATEGORIES.includes(category)) {
    return {allowed:false,category,category_label:categoryLabel,
      reason:`Company-wide internet restriction: ${categoryLabel} is unavailable for non-administrators.`,
      basis:'Mandatory company restriction'};
  }
  if (blockRule) {
    return { allowed: false, category, category_label: categoryLabel, reason: blockRule.note || `This website is blocked by company policy (${target}).`, basis: 'Site blocklist' };
  }
  if (grant) {
    return { allowed: true, category, category_label: categoryLabel, reason: `Temporary access approved until ${new Date(grant.expires_at).toLocaleString()}.`, basis: 'Temporary approval' };
  }
  if (allowRule) {
    return { allowed: true, category, category_label: categoryLabel, reason: allowRule.note || 'Approved company website.', basis: 'Site allowlist' };
  }

  const blocked = new Set((policy?.blocked_categories || []).map(value => String(value)));
  if (category && blocked.has(category)) {
    return { allowed: false, category, category_label: categoryLabel, reason: `${categoryLabel} is blocked by your browsing profile.`, basis: 'Category restriction' };
  }
  if (policy?.strict_search_only) {
    return { allowed: false, category, category_label: categoryLabel, reason: 'Your profile is strict search-only: results are visible, but external websites cannot be opened.', basis: 'Strict search-only' };
  }
  if (policy?.allowed_domains?.length && longestMatch(target, policy.allowed_domains)) {
    return { allowed: true, category, category_label: categoryLabel, reason: 'Listed on the company allowlist.', basis: 'Profile allowlist' };
  }
  if (policy?.blocked_domains?.length && longestMatch(target, policy.blocked_domains)) {
    return { allowed: false, category, category_label: categoryLabel, reason: 'This website is blocked by company policy.', basis: 'Profile blocklist' };
  }
  if (policy?.profile === 'admin_access') {
    return { allowed: true, category, category_label: categoryLabel, reason: 'Administrator access profile.', basis: 'Administrator access' };
  }
  if (isResearchDomain(target)) {
    return { allowed: true, category, category_label: categoryLabel, reason: 'Approved research and reference source.', basis: 'Research reference' };
  }
  return {
    allowed: false,
    category,
    category_label: categoryLabel,
    reason: 'This website is not on the company approved list. Request access with a business justification.',
    basis: 'Not approved',
  };
}

export function directoryEntries() {
  return RESEARCH_DOMAINS
    .filter(entry => !['gov', 'mil', 'edu', 'gov.uk', 'gc.ca'].includes(entry))
    .slice(0, 24);
}