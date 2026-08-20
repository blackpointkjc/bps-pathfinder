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

export async function getTeamsSyncConfig(configKey = 'team_chat') {
  const rows = await base44.entities.MicrosoftTeamsSyncConfig.filter({ config_key: configKey }, '-updated_at', 1);
  return rows?.[0] || null;
}

export async function saveTeamsSyncConfig({ channelUrl, channelName = 'Microsoft Teams', updatedBy = '', configKey = 'team_chat' }) {
  const parsed = parseTeamsChannelLink(channelUrl);
  const existing = await base44.entities.MicrosoftTeamsSyncConfig.filter({ config_key: configKey }, '-updated_at', 1);
  const payload = {
    config_key: configKey,
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

export async function sendTeamChannelMessage(userId, text, config = null, configKey = 'team_chat') {
  const target = config || await getTeamsSyncConfig(configKey);
  if (!target?.enabled || !target?.team_id || !target?.channel_id) return null;
  const payload = await graphRequest(userId, `/teams/${encodeURIComponent(target.team_id)}/channels/${encodeURIComponent(target.channel_id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: { contentType: 'html', content: String(text || '').replace(/\n/g, '<br>') } }),
  });
  return payload;
}

export async function syncTeamsChannelToEntity(userId, { config = null, configKey = 'team_chat', entityName = 'ChatMessage' } = {}) {
  const target = config || await getTeamsSyncConfig(configKey);
  if (!target?.enabled || !target?.team_id || !target?.channel_id) return { imported: 0 };
  const payload = await graphRequest(userId, `/teams/${encodeURIComponent(target.team_id)}/channels/${encodeURIComponent(target.channel_id)}/messages?$top=50`);
  const rows = payload?.value || [];
  let imported = 0;
  for (const item of [...rows].reverse()) {
    if (!item?.id) continue;
    const entity = base44.entities[entityName];
    if (!entity) throw new Error(`Unknown Pathfinder chat entity: ${entityName}`);
    const existing = await entity.filter({ teams_message_id: item.id }, '-created_date', 1);
    if (existing?.length) continue;
    const body = stripHtml(item?.body?.content || '').trim();
    if (!body) continue;
    const senderName = item?.from?.user?.displayName || item?.from?.application?.displayName || 'Microsoft Teams';
    await entity.create({
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

export async function syncTeamsChannelToPathfinder(userId, config = null) {
  return syncTeamsChannelToEntity(userId, { config, configKey: 'officer_chat', entityName: 'ChatMessage' });
}

async function resolveTeamsIdentity(pathfinderUserId, fallbackEmail = '') {
  const rows = await base44.entities.MicrosoftTeamsIdentity.filter({ user_id: pathfinderUserId, active: true }, '-updated_at', 5).catch(() => []);
  if (rows?.[0]?.microsoft_user_id) return rows[0];
  const email = String(rows?.[0]?.microsoft_email || fallbackEmail || '').trim().toLowerCase();
  if (!email) throw new Error('That Pathfinder user has not connected Microsoft 365 yet.');
  return { user_id: pathfinderUserId, microsoft_email: email, microsoft_user_id: '' };
}

async function resolveGraphUser(userId, identity) {
  if (identity?.microsoft_user_id) return identity.microsoft_user_id;
  if (!identity?.microsoft_email) throw new Error('Microsoft Teams identity is missing.');
  const profile = await graphRequest(userId, `/users/${encodeURIComponent(identity.microsoft_email)}?$select=id,displayName,mail,userPrincipalName`);
  if (!profile?.id) throw new Error(`Microsoft could not resolve ${identity.microsoft_email}.`);
  return profile.id;
}

export async function sendTeamsDirectMessage(userId, { participantIds = [], participantDirectory = [], text = '', existingChatId = '' } = {}) {
  if (!userId) throw new Error('A Pathfinder session is required for Teams messaging.');
  const uniqueIds = [...new Set((participantIds || []).filter(Boolean))];
  const recipientIds = uniqueIds.filter(id => String(id) !== String(userId));
  if (!recipientIds.length) throw new Error('Select at least one Teams recipient.');

  let chatId = String(existingChatId || '').trim();
  if (!chatId) {
    const me = await graphRequest(userId, '/me?$select=id,displayName,mail,userPrincipalName');
    const members = [{
      '@odata.type': '#microsoft.graph.aadUserConversationMember',
      roles: ['owner'],
      'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${me.id}')`,
    }];
    for (const recipientId of recipientIds) {
      const fallback = participantDirectory.find(item => String(item.id) === String(recipientId))?.email || '';
      const identity = await resolveTeamsIdentity(recipientId, fallback);
      const graphUserId = await resolveGraphUser(userId, identity);
      members.push({
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        roles: ['owner'],
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${graphUserId}')`,
      });
    }
    const chatType = members.length === 2 ? 'oneOnOne' : 'group';
    const created = await graphRequest(userId, '/chats', {
      method: 'POST',
      body: JSON.stringify({ chatType, ...(chatType === 'group' ? { topic: 'Pathfinder Direct Message' } : {}), members }),
    });
    chatId = created?.id || '';
    if (!chatId) throw new Error('Microsoft Teams did not return a chat ID.');
  }

  const message = await graphRequest(userId, `/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: { contentType: 'html', content: String(text || '').replace(/\n/g, '<br>') } }),
  });
  return { chatId, messageId: message?.id || '', message };
}

export async function syncTeamsDirectMessages(userId, { chatId, threadKey = '', currentPathfinderUserId, participantIds = [], participantNames = [] } = {}) {
  if (!chatId || !userId || !currentPathfinderUserId) return { imported: 0 };
  const [me, payload] = await Promise.all([
    graphRequest(userId, '/me?$select=id'),
    graphRequest(userId, `/chats/${encodeURIComponent(chatId)}/messages?$top=50`),
  ]);
  const identities = await base44.entities.MicrosoftTeamsIdentity.list('-updated_at', 500).catch(() => []);
  const byMicrosoftId = new Map((identities || []).filter(item => item.microsoft_user_id).map(item => [String(item.microsoft_user_id), item]));
  let imported = 0;
  for (const item of [...(payload?.value || [])].reverse()) {
    if (!item?.id || !item?.body?.content) continue;
    const existing = await base44.entities.Message.filter({ teams_message_id: item.id }, '-created_date', 5).catch(() => []);
    if (existing?.length) continue;
    const senderMicrosoftId = item?.from?.user?.id || '';
    const mine = String(senderMicrosoftId) === String(me?.id || '');
    const mappedSender = byMicrosoftId.get(String(senderMicrosoftId));
    const senderId = mine ? currentPathfinderUserId : (mappedSender?.user_id || `teams:${senderMicrosoftId || 'unknown'}`);
    const senderName = item?.from?.user?.displayName || mappedSender?.display_name || 'Microsoft Teams';
    const body = stripHtml(item.body.content).trim();
    if (!body) continue;
    const otherIds = (participantIds || []).filter(id => String(id) !== String(currentPathfinderUserId));
    const recipientId = mine ? (otherIds[0] || currentPathfinderUserId) : currentPathfinderUserId;
    await base44.entities.Message.create({
      sender_id: senderId,
      sender_name: senderName,
      recipient_id: recipientId,
      recipient_name: mine ? (participantNames?.[0] || '') : '',
      message: body,
      read: mine,
      message_type: 'dispatch_message',
      thread_id: threadKey || `teams:${chatId}`,
      participant_ids: participantIds,
      participant_names: participantNames,
      teams_chat_id: chatId,
      teams_message_id: item.id,
      teams_synced_at: new Date().toISOString(),
    });
    imported += 1;
  }
  return { imported };
}

function memberPathfinderId(member, identityByMicrosoftId) {
  const microsoftId = member?.userId || member?.user?.id || member?.id || '';
  const mapped = identityByMicrosoftId.get(String(microsoftId));
  return mapped?.user_id || (microsoftId ? `teams:${microsoftId}` : 'teams:unknown');
}

function memberDisplayName(member, identityByMicrosoftId) {
  const microsoftId = member?.userId || member?.user?.id || member?.id || '';
  const mapped = identityByMicrosoftId.get(String(microsoftId));
  return member?.displayName || mapped?.display_name || mapped?.microsoft_email || 'Microsoft Teams User';
}

export async function syncAllTeamsDirectChats(userId, currentPathfinderUserId) {
  if (!userId || !currentPathfinderUserId) return { chats: 0, imported: 0 };
  const [me, identities, chatsPayload] = await Promise.all([
    graphRequest(userId, '/me?$select=id,displayName,mail,userPrincipalName'),
    base44.entities.MicrosoftTeamsIdentity.list('-updated_at', 500).catch(() => []),
    graphRequest(userId, '/me/chats?$top=50&$expand=members,lastMessagePreview'),
  ]);
  const identityByMicrosoftId = new Map((identities || []).filter(item => item.microsoft_user_id).map(item => [String(item.microsoft_user_id), item]));
  const meMicrosoftId = String(me?.id || '');
  let imported = 0;
  let chats = 0;

  for (const chat of chatsPayload?.value || []) {
    if (!chat?.id || !['oneOnOne', 'group'].includes(chat.chatType)) continue;
    const members = (chat.members || []).filter(member => member?.userId || member?.user?.id || member?.id);
    if (!members.length) continue;
    chats += 1;
    const otherMembers = members.filter(member => String(member?.userId || member?.user?.id || member?.id || '') !== meMicrosoftId);
    const participantIds = [currentPathfinderUserId, ...otherMembers.map(member => memberPathfinderId(member, identityByMicrosoftId))];
    const participantNames = [me?.displayName || 'You', ...otherMembers.map(member => memberDisplayName(member, identityByMicrosoftId))];
    const result = await syncTeamsDirectMessages(userId, {
      chatId: chat.id,
      threadKey: `teams:${chat.id}`,
      currentPathfinderUserId,
      participantIds,
      participantNames,
    });
    imported += Number(result?.imported || 0);
  }
  return { chats, imported };
}
