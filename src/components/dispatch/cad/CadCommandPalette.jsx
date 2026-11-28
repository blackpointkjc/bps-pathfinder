import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { cadPriority, cadReferenceValue } from '@/lib/cadOperationalStatus';

const MAX_PER_GROUP = 6;

/**
 * CommandCentral-style universal command palette (Ctrl/Cmd + K).
 * Searches active incidents, the live unit roster and every workstation from
 * one keyboard entry point instead of hunting across three panes.
 */
export default function CadCommandPalette({
  open,
  onClose,
  calls = [],
  units = [],
  workstations = [],
  onSelectCall,
  onSelectUnit,
  onSelectWorkstation,
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = values => !needle || values.filter(Boolean).join(' ').toLowerCase().includes(needle);
    const stations = workstations.filter(station => match([station.label, station.short]));
    const incidents = calls.filter(call => match([cadReferenceValue(call), call.incident, call.location, call.agency, call.status]));
    const roster = units.filter(unit => match([unit.unit_number, unit.rank, unit.last_name, unit.full_name, unit.platoon, unit.status]));
    return [
      ...stations.slice(0, MAX_PER_GROUP).map(station => ({
        key: 'station-' + station.id,
        group: 'Workstation',
        label: station.label,
        detail: station.short || '',
        run: () => onSelectWorkstation?.(station),
      })),
      ...incidents.slice(0, MAX_PER_GROUP).map(call => ({
        key: 'call-' + call.id,
        group: 'Incident',
        label: cadReferenceValue(call),
        detail: [call.incident, call.location].filter(Boolean).join(' · ') || 'Incident pending',
        badge: cadPriority(call).slice(0, 2).toUpperCase(),
        run: () => onSelectCall?.(call),
      })),
      ...roster.slice(0, MAX_PER_GROUP).map(unit => ({
        key: 'unit-' + (unit.id || unit.email),
        group: 'Unit',
        label: [unit.unit_number ? 'Unit ' + unit.unit_number : '', unit.rank, unit.last_name].filter(Boolean).join(' ') || 'Officer',
        detail: [unit.status, unit.platoon].filter(Boolean).join(' · '),
        run: () => onSelectUnit?.(unit),
      })),
    ];
  }, [query, calls, units, workstations, onSelectCall, onSelectUnit, onSelectWorkstation]);

  useEffect(() => {
    if (active > rows.length - 1) setActive(0);
  }, [rows.length, active]);

  if (!open) return null;

  const choose = row => {
    if (!row) return;
    row.run();
    onClose?.();
  };

  const handleKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(index => (index + 1) % Math.max(1, rows.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => (index - 1 + rows.length) % Math.max(1, rows.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
    }
  };

  return (
    <div className="cad-palette-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="cad-palette" role="dialog" aria-modal="true" aria-label="CAD command search" onKeyDown={handleKeyDown}>
        <label className="cad-palette-field">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search incidents, units, workstations…"
            aria-label="Search incidents, units and workstations"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="cad-palette-results" role="listbox" aria-label="Search results">
          {rows.map((row, index) => (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={index === active}
              className="cad-palette-row"
              data-active={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(row)}
            >
              <span className="cad-palette-group">{row.group}</span>
              <span className="cad-palette-main">
                <b>{row.label}</b>
                {row.detail && <small>{row.detail}</small>}
              </span>
              {row.badge && <span className="cad-palette-badge">{row.badge}</span>}
              {index === active && <CornerDownLeft size={14} />}
            </button>
          ))}
          {!rows.length && <p className="cad-palette-empty">No matching incidents, units or workstations.</p>}
        </div>
        <footer className="cad-palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Alt</kbd> + <kbd>1–8</kbd> workstations</span>
        </footer>
      </div>
    </div>
  );
}