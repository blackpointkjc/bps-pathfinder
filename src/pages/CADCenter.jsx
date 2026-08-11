import { Activity, AlertTriangle, History, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import UnifiedCenter, { useDesktopViewport } from '@/components/UnifiedCenter';
import CenterToolSection from '@/components/CenterToolSection';
import CommandDashboard from './CommandDashboard';
import DispatchCenter from './DispatchCenter';
import Navigation from './Navigation';
import BOLOAlerts from './BOLOAlerts';
import CallHistory from './CallHistory';
import RecordsAssistant from './RecordsAssistant';
import Personnel from './Personnel';
import PathfinderReports from './Reports';
import AdminPortal from './AdminPortal';

const BASE_SECTIONS = [
  { id: 'live', label: 'Live Operations', description: 'Command board, dispatch queue and live map', icon: Activity },
  { id: 'alerts', label: 'Alerts', description: 'BOLOs, officer-safety and property notices', icon: AlertTriangle },
  { id: 'history', label: 'History & Intelligence', description: 'Call history and company-wide record search', icon: History },
];

const TOOLS = {
  live: [
    { id: 'command', label: 'Command Board', component: CommandDashboard },
    { id: 'dispatch', label: 'Dispatch Queue', component: DispatchCenter },
    { id: 'map', label: 'Live Map', component: Navigation },
  ],
  alerts: [{ id: 'bolo', label: 'BOLO / Alerts', component: BOLOAlerts }],
  history: [
    { id: 'history', label: 'Call History', component: CallHistory },
    { id: 'records', label: 'Records AI', component: RecordsAssistant },
  ],
  admin: [
    { id: 'personnel', label: 'CAD Personnel', component: Personnel },
    { id: 'reports', label: 'CAD Reports', component: PathfinderReports },
    { id: 'control', label: 'Admin Control', component: AdminPortal },
  ],
};

export default function CADCenter() {
  const desktop = useDesktopViewport();
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const fullAccess = user?.role === 'admin' || roles.has('full_access');
  const sections = fullAccess
    ? [...BASE_SECTIONS, { id: 'admin', label: 'CAD Administration', description: 'Personnel, reports and control settings', icon: Settings }]
    : BASE_SECTIONS;

  if (!desktop) return <CommandDashboard />;

  return (
    <UnifiedCenter
      eyebrow="Computer Aided Dispatch"
      title="CAD Center"
      description="One desktop workspace for live calls, unit status, mapping, alerts, history, and records intelligence."
      sections={sections}
      defaultSection="live"
      contentClassName="bg-[#07111f] text-slate-100 shadow-[inset_0_1px_0_rgba(51,65,85,.45)]"
    >
      {section => <CenterToolSection key={section} tools={TOOLS[section] || TOOLS.live} />}
    </UnifiedCenter>
  );
}
