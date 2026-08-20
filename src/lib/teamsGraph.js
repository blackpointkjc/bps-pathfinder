import { base44 } from '@/api/base44Client';
import { graphRequest } from '@/lib/outlookGraph';

function stripHtml(value) {
  if (!value) return '';
  try {
    const doc = new DOMParser().parseFromString(String(value), 'text/html');
    return doc.body?.textContent || '';
  } catch {
    return String(value).replace(/<[^>]+>/g, ' ');
  }
}

export function parseTeamsChannelLink(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Paste the Microsoft Teams channel link.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('That is not a valid Teams channel link.'); }
  const groupId = url.searchParams.get('groupId');
  const match = url.pathname.match(/\/channel\/([^/]+)/i);
  const channelId = match?.[1] ? decodeURIComponent(match[1]) : '';
  if (!groupId || !channelId) throw new Error('Unable to read the Team or Channel ID from that Teams link. Open the channel in Teams, choose Copy link to channel, and paste that link here.');
  return { teamId: groupId, channelId, channelUrl: raw };
}

export async function getTeamsSyncConfig() {
  const rows = await base44.entities.MicrosoftTeamsSyncConfig.filter({ config_key: 'team_chat' }, '-updated_at', 1);
  return rows?.[0] || null;
}

export async function saveTeamsSyncConfig({ channelUrl, channelName = 'Microsoft Teams', updatedBy = '' }) {
  const parsed = parseTeamsChannelLink(channelUrl);
  const existing = await base44.entities.MicrosoftTeamsSyncConfig.filter({ config_key: 'team_chat' }, '-updated_at', 1);
  const payload = {
    config_key: 'team_chat',
    team_id: parsed.teamId,
    channel_id: parsed.channelId,
    channel_name: channelName || 'Microsoft Teams',
    channel_url: parsed.channelUrl,
    enabled: true,
    updated_by: String(updatedBy || ''),
    updated_at: new Date().toISOString(),
  };
  if (existing?.[0]?.id) {
    await base44.entities.MicrosoftTeamsSyncConfig.update(existing[0].id, payload);
    return { ...existing[0], ...payload };
  }
  return base44.entities.MicrosoftTeamsSyncConfig.create(payload);
}

export async function sendTeamChannelMessage(userId, text, config = null) {
  const target = config || await getTeamsSyncConfig();
  if (!target?.enabled || !target?.team_id || !target?.channel_id) return null;
  const payload = await graphRequest(userId, `/teams/${encodeURIComponent(target.team_id)}/channels/${encodeURIComponent(target.channel_id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: { contentType: 'html', content: String(text || '').replace(/\n/g, '<br>') } }),
  });
  return payload;
}

export async function syncTeamsChannelToPathfinder(userId, config = null) {
  const target = config || await getTeamsSyncConfig();
  if (!target?.enabled || !target?.team_id || !target?.channel_id) return { imported: 0 };
  const payload = await graphRequest(userId, `/teams/${encodeURIComponent(target.team_id)}/channels/${encodeURIComponent(target.channel_id)}/messages?$top=50`);
  const rows = payload?.value || [];
  let imported = 0;
  for (const item of [...rows].reverse()) {
    if (!item?.id) continue;
    const existing = await base44.entities.ChatMessage.filter({ teams_message_id: item.id }, '-created_date', 1);
    if (existing?.length) continue;
    const body = stripHtml(item?.body?.content || '').trim();
    if (!body) continue;
    const senderName = item?.from?.user?.displayName || item?.from?.application?.displayName || 'Microsoft Teams';
    await base44.entities.ChatMessage.create({
      message: body,
      sender_name: senderName,
      sender_email: '',
      message_source: 'teams',
      teams_message_id: item.id,
      teams_team_id: target.team_id,
      teams_channel_id: target.channel_id,
      teams_sender_id: item?.from?.user?.id || '',
      teams_sender_name: senderName,
      teams_created_at: item.createdDateTime || null,
      teams_synced_at: new Date().toISOString(),
    });
    imported += 1;
  }
  return { imported };
}
