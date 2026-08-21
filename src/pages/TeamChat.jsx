import { Navigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// Legacy route retained so old bookmarks do not break. Pathfinder no longer uses
// a separate internal/generic Team Chat. Officer operational chat is backed by
// the configured Microsoft Teams General Chat channel.
export default function TeamChat() {
  return <Navigate to={createPageUrl('OfficerChat')} replace />;
}
