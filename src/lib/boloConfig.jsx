import { User, Car, Shield, Bell, Eye, FileWarning } from 'lucide-react';

export const TYPE_CONFIG = {
  wanted_person:       { label: 'WANTED PERSON',  icon: User,        border: 'border-red-500/60',    badge: 'bg-red-950 text-red-300 border-red-500/60' },
  missing_person:      { label: 'MISSING PERSON', icon: User,        border: 'border-orange-500/60', badge: 'bg-orange-950 text-orange-300 border-orange-500/60' },
  stolen_vehicle:      { label: 'STOLEN VEHICLE', icon: Car,         border: 'border-yellow-500/60', badge: 'bg-yellow-950 text-yellow-300 border-yellow-500/60' },
  officer_safety:      { label: 'OFFICER SAFETY', icon: Shield,      border: 'border-red-500',       badge: 'bg-red-950 text-red-200 border-red-400' },
  special_instruction: { label: 'SPECIAL INFO',   icon: Bell,        border: 'border-blue-500/60',   badge: 'bg-blue-950 text-blue-300 border-blue-500/60' },
  property_alert:      { label: 'PROPERTY ALERT', icon: FileWarning, border: 'border-purple-500/60', badge: 'bg-purple-950 text-purple-300 border-purple-500/60' },
  watch_notice:        { label: 'WATCH NOTICE',   icon: Eye,         border: 'border-teal-500/60',   badge: 'bg-teal-950 text-teal-300 border-teal-500/60' },
};

export const PRIORITY_STYLE = {
  critical: 'bg-red-950 text-red-200 border-red-500',
  high: 'bg-orange-950 text-orange-200 border-orange-500',
  medium: 'bg-yellow-950 text-yellow-200 border-yellow-500',
  low: 'bg-slate-800 text-slate-300 border-slate-600',
};
