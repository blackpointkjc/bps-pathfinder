import { BookOpen, GraduationCap, ShieldCheck, Users, LayoutDashboard } from 'lucide-react';
import UnifiedCenter from '@/components/UnifiedCenter';
import AdminTraining from './AdminTraining';
import TrainingRecords from './TrainingRecords';
import AdminTrainingCompliance from './AdminTrainingCompliance';
import ManageStudents from './ManageStudents';
import TrainerOverview from './TrainerOverview';

const SECTIONS = [
  { id: 'overview', label: 'Overview', description: 'Training command dashboard and workload', icon: LayoutDashboard },
  { id: 'courses', label: 'Training Setup', description: 'Create and manage the training catalog and modules', icon: GraduationCap },
  { id: 'classes', label: 'Training Records', description: 'Classes, rosters, certificates and school records', icon: BookOpen },
  { id: 'compliance', label: 'Compliance & Records', description: 'Officer certifications, assignments, reviews, alerts and reporting', icon: ShieldCheck },
  { id: 'students', label: 'Students', description: 'Student accounts and assigned training', icon: Users },
];

export default function TrainerCenter() {
  return (
    <UnifiedCenter eyebrow="Training Operations" title="Trainer Center" description="One connected workspace for training setup, records, officer compliance, certifications, alerts, and student management." sections={SECTIONS} defaultSection="overview">
      {section => (
        <div className="w-full">
          {section === 'overview' && <TrainerOverview />}
          {section === 'courses' && <AdminTraining embedded />}
          {section === 'classes' && <TrainingRecords embedded />}
          {section === 'compliance' && <AdminTrainingCompliance embedded />}
          {section === 'students' && <ManageStudents embedded />}
        </div>
      )}
    </UnifiedCenter>
  );
}
