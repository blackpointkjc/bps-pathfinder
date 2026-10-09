import { BookOpen, GraduationCap, ShieldCheck, Users, LayoutDashboard, FilePlus2, UserPlus, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import UnifiedCenter from '@/components/UnifiedCenter';
import AdminTraining from './AdminTraining';
import TrainingRecords from './TrainingRecords';
import AdminTrainingCompliance from './AdminTrainingCompliance';
import ManageStudents from './ManageStudents';
import TrainerOverview from './TrainerOverview';
import AdminDocuments from './AdminDocuments';

const SECTIONS = [
  { id: 'overview', label: 'Overview & Work Queue', description: 'Training dashboard, alerts and priority workload', icon: LayoutDashboard },
  { id: 'courses', label: 'Course Setup', description: 'Create and manage the training catalog and modules', icon: GraduationCap },
  { id: 'classes', label: 'Classes & Certificates', description: 'Classes, rosters, certificates and school records', icon: BookOpen },
  { id: 'compliance', label: 'Compliance', description: 'Officer certifications, assignments, reviews, alerts and reporting', icon: ShieldCheck },
  { id: 'students', label: 'Student Management', description: 'Student accounts and assigned training', icon: Users },
  { id: 'documents', label: 'Training Documents', description: 'Training manuals, policies, site materials and reference files', icon: BookOpen },
];

export default function TrainerCenter({ embedded = false }) {
  const navigate = useNavigate();
  const jumpTo = section => navigate(`?${embedded ? 'trainer_section' : 'section'}=${section}`);
  return (
    <UnifiedCenter eyebrow="Training Operations" title="Trainer Center" description="One connected workspace for training setup, records, officer compliance, certifications, alerts, and student management." sections={SECTIONS} defaultSection="overview" queryParam={embedded ? 'trainer_section' : 'section'} embedded={embedded}>
      {section => (
        <div className="w-full">
          <div className="sticky top-0 z-20 flex flex-wrap gap-2 border-b border-violet-900/40 bg-[#090f1d] px-3 py-2 md:px-5">
            <button type="button" onClick={() => jumpTo('students')} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white"><UserPlus className="h-4 w-4"/>Students & Approvals</button>
            <button type="button" onClick={() => jumpTo('courses')} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200"><FilePlus2 className="h-4 w-4"/>Create Training</button>
            <button type="button" onClick={() => jumpTo('compliance')} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200"><ClipboardCheck className="h-4 w-4"/>Certification Reviews</button>
            <button type="button" onClick={() => jumpTo('classes')} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200"><BookOpen className="h-4 w-4"/>Classes & Certificates</button>
          </div>
          {section === 'overview' && <TrainerOverview />}
          {section === 'courses' && <AdminTraining embedded />}
          {section === 'classes' && <TrainingRecords embedded />}
          {section === 'compliance' && <AdminTrainingCompliance embedded />}
          {section === 'students' && <ManageStudents embedded />}
          {section === 'documents' && <AdminDocuments embedded />}
        </div>
      )}
    </UnifiedCenter>
  );
}
