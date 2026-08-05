import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { brandEmailPayload } from '@/utils/blackPointEmail';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Central email-branding guard. Every app email is normalized to the Black Point
// HTML design before it reaches the Base44 email integration.
const rawSendEmail = base44.integrations?.Core?.SendEmail?.bind(base44.integrations.Core);
if (rawSendEmail) {
  base44.integrations.Core.SendEmail = payload => rawSendEmail(brandEmailPayload(payload));
}
