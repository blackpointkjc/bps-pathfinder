import { useMemo, useState } from 'react';
import { BookOpen, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import AdminTraining from './AdminTraining';
import TrainingRecords from './TrainingRecords';
import AdminTrainingCompliance from './AdminTrainingCompliance';
import ManageStudents from './ManageStudents';

const SECTIONS = [
  { id: 'courses', label: 'Training Setup', description: 'The single place to create and manage training courses/modules', icon: GraduationCap },
  { id: 'classes', label: 'Training Records', description: 'The single place for classes, rosters, certificates and school records', icon: BookOpen },
  { id: 'compliance', label: 'Compliance & Records', description: 'Officer certifications, assignments, reviews, requirements, alerts and reporting', icon: ShieldCheck },
  { id: 'students', label: 'Students', description: 'Student accounts and assigned training', icon: Users },
];

export default function TrainerCenter() {
  const initial = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return SECTIONS.some(section => section.id === requested) ? requested : 'compliance';
  }, []);
  const [section, setSection] = useState(initial);

  const selectSection = (next) => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set('section', next);
    window.history.replaceState({}, '', url);
  };

  return (
    <div className="min-h-full bg-[#070d17] text-slate-100">
      <div className="border-b border-slate-800 bg-[#0a1220] px-4 py-4 md:px-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-400">Training Operations</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">Trainer Center</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">One workspace with one training setup, one training-record system, one compliance/officer-record system, and student management.</p>
            </div>
            <div className="text-xs text-slate-500">Legacy trainer pages remain route-compatible, but day-to-day work is consolidated here.</div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {SECTIONS.map(({ id, label, description, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectSection(id)}
                  aria-pressed={active}
                  className={`min-w-0 rounded-xl border p-3 text-left transition ${active ? 'border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,.12)]' : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-900'}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
                    <span className={`truncate text-xs font-black ${active ? 'text-white' : 'text-slate-300'}`}>{label}</span>
                  </div>
                  <p className="mt-1 hidden text-[10px] leading-4 text-slate-500 xl:block">{description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden">
        {section === 'courses' && <AdminTraining embedded />}
        {section === 'classes' && <TrainingRecords embedded />}
        {section === 'compliance' && <AdminTrainingCompliance embedded />}
        {section === 'students' && <ManageStudents embedded />}
      </div>
    </div>
  );
}
