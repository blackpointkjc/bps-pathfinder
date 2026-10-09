import { useEffect, useLayoutEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DISPLAY_DEFAULTS, displayStorageKey, readDisplayPreferences, normalizeDisplayPreferences } from '@/lib/displayPreferences';

const TEXT_SIZES = ['standard', 'large', 'extra-large'];
const TEXT_LABELS = { standard: 'Standard', large: 'Larger', 'extra-large': 'Largest' };

export default function DisplayPreferences({ userId }) {
  const storageKey = displayStorageKey(userId);
  const [settings, setSettings] = useState(() => {
    try { return readDisplayPreferences(window.localStorage, storageKey); }
    catch { return { ...DISPLAY_DEFAULTS }; }
  });
  const [saveError, setSaveError] = useState(false);
  const sizeIndex = TEXT_SIZES.indexOf(settings.text);

  useLayoutEffect(() => {
    const root = document.documentElement;
    Object.entries(settings).forEach(([key, value]) => root.setAttribute('data-pf-' + key, value));
    return () => Object.keys(DISPLAY_DEFAULTS).forEach(key => root.removeAttribute('data-pf-' + key));
  }, [settings]);

  useEffect(() => {
    const sync = event => {
      if (event.key === storageKey || event.key === null) {
        try { setSettings(readDisplayPreferences(window.localStorage, storageKey)); }
        catch { setSettings({ ...DISPLAY_DEFAULTS }); }
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey]);

  const update = patch => {
    const next = normalizeDisplayPreferences({ ...settings, ...patch });
    setSettings(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveError(false);
    } catch { setSaveError(true); }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="pf-display-trigger" aria-label="Display settings: text size, contrast and spacing" title="Display settings">
          <span aria-hidden="true">A− / A+</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="Display settings" className="pf-display-panel w-[min(400px,calc(100vw-24px))] max-h-[min(760px,calc(100dvh-90px))] overflow-y-auto space-y-4">
        <h2 className="font-bold">Display settings</h2>
        <p>Make Pathfinder comfortable to read. Changes apply across your pages immediately.</p>

        <fieldset className="pf-display-group">
          <legend>Text size</legend>
          <div className="pf-text-controls">
            <button type="button" aria-label="Decrease text size" disabled={sizeIndex === 0} onClick={() => update({ text: TEXT_SIZES[sizeIndex - 1] })}>A−</button>
            <output aria-live="polite">{TEXT_LABELS[settings.text]}</output>
            <button type="button" aria-label="Increase text size" disabled={sizeIndex === TEXT_SIZES.length - 1} onClick={() => update({ text: TEXT_SIZES[sizeIndex + 1] })}>A+</button>
          </div>
          <div className="pf-choice-row">
            {TEXT_SIZES.map(value => <button type="button" key={value} aria-pressed={settings.text === value} onClick={() => update({ text: value })}>{TEXT_LABELS[value]}</button>)}
          </div>
        </fieldset>

        <fieldset className="pf-display-group">
          <legend>Contrast</legend>
          <div className="pf-choice-row">
            <button type="button" aria-pressed={settings.contrast === 'standard'} onClick={() => update({ contrast: 'standard' })}>Standard</button>
            <button type="button" aria-pressed={settings.contrast === 'high'} onClick={() => update({ contrast: 'high' })}>High contrast</button>
          </div>
          <p>High contrast brightens secondary labels and strengthens borders.</p>
        </fieldset>

        <fieldset className="pf-display-group">
          <legend>Spacing &amp; controls</legend>
          <div className="pf-choice-row">
            <button type="button" aria-pressed={settings.spacing === 'standard'} onClick={() => update({ spacing: 'standard' })}>Standard</button>
            <button type="button" aria-pressed={settings.spacing === 'comfortable'} onClick={() => update({ spacing: 'comfortable' })}>Roomier</button>
          </div>
          <p>Roomier adds space to rows and makes controls easier to tap.</p>
        </fieldset>

        <label className="pf-motion-choice">
          <input type="checkbox" checked={settings.motion === 'reduced'} onChange={event => update({ motion: event.target.checked ? 'reduced' : 'system' })} />
          Reduce animation
        </label>
        <div className="pf-display-sample" aria-label="Display preview">
          <strong style={{ fontSize: settings.text === 'extra-large' ? 20 : settings.text === 'large' ? 18 : 16 }}>Officer status: Available</strong>
          <p style={{ fontSize: settings.text === 'extra-large' ? 16 : settings.text === 'large' ? 14 : 12, color: settings.contrast === 'high' ? '#f1f5f9' : '#aebfd0', paddingBlock: settings.spacing === 'comfortable' ? 10 : 2 }}>Incident details and location appear here.</p>
        </div>
        <p className="pf-display-save" role="status">{saveError ? 'Applied for now. This browser could not save your preference.' : 'Saved for your account on this browser. Other officers keep their own settings.'}</p>
        <button type="button" className="pf-display-reset" onClick={() => update(DISPLAY_DEFAULTS)}>Reset display settings</button>
      </PopoverContent>
    </Popover>
  );
}
