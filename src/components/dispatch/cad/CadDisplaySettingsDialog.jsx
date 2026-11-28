import { CAD_SCALES } from '@/lib/cadDisplaySettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, RotateCcw } from 'lucide-react';
import './cad-upgrade.css';

/**
 * Per-workstation display settings. Scaling is stored on this browser so one
 * dispatcher's readability choice never changes another workstation's layout.
 */
export default function CadDisplaySettingsDialog({ open, onOpenChange, settings, onChange }) {
  const update = patch => onChange?.({ ...settings, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cad-settings max-w-lg border-slate-700 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>CAD display settings</DialogTitle>
          <DialogDescription>
            Saved on this workstation. Scaling enlarges labels and controls without clipping the workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="cad-settings-body">
          <h3>Display scale</h3>
          <div className="cad-settings-scales">
            {CAD_SCALES.map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={settings?.scale === option.id}
                onClick={() => update({ scale: option.id })}
              >
                <span>
                  <b>{option.label}</b>
                  <small>{option.note}</small>
                </span>
                {settings?.scale === option.id && <Check size={15} />}
              </button>
            ))}
          </div>
          <h3>Workspace</h3>
          <button
            type="button"
            className="cad-settings-toggle"
            aria-pressed={Boolean(settings?.monitor)}
            onClick={() => update({ monitor: !settings?.monitor })}
          >
            <span>
              <b>Incident monitor</b>
              <small>Show an at-risk incident strip outside the unified command board</small>
            </span>
            <i>{settings?.monitor ? 'Shown' : 'Hidden'}</i>
          </button>
          <button type="button" className="cad-settings-toggle" aria-pressed={settings?.showMap!==false} onClick={()=>update({showMap:settings?.showMap===false})}><span><b>Integrated map</b><small>Keep the tactical map on the command workstation.</small></span><i>{settings?.showMap===false?'Hidden':'Shown'}</i></button>
          <button
            type="button"
            className="cad-settings-reset"
            onClick={() => onChange?.({ scale: 'standard', monitor: true, showMap: true })}
          >
            <RotateCcw size={14} /> Restore defaults
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}