import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Force every browser-side email through one backend gateway. That gateway applies
// the Black Point template server-side, so individual pages cannot accidentally
// bypass branding by calling SendEmail directly.
if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = payload => base44.functions.invoke('sendBrandedEmail', payload);
}
