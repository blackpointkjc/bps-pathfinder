import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { cadPriority, cadReferenceValue } from '@/lib/cadOperationalStatus';
import './cad-command.css';

const GROUP_LIMIT = 5;

/**
 * CommandCentral-style universal command palette (Ctrl/Cmd + K).
 * Finds an incident, a unit or a workstation from one keyboard entry point
 * instead of hunting across three panes.
 */
export default function CadCommandPalette({
  open,
  onClose,
  calls = [],
  units = [],
  workstations = [],
  commands = [],
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

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (...values) => !term || values.filter(Boolean).join(' ').toLowerCase().includes(term);
    return [
      {
        id: 'commands',
        title: 'Commands',
        items: commands
          .filter(command => matches(command.label, command.detail))
          .slice(0, GROUP_LIMIT)
          .map(command => ({
            id: command.id,
            label: command.label,
            detail: command.detail || 'CAD command',
            run: command.run,
          })),
      },
      {
        id: 'calls',
        title: 'Incidents',
        items: calls
          .filter(call => matches(cadReferenceValue(call), call.incident, call.location, call.agency))
          .slice(0, GROUP_LIMIT)
          .map(call => ({
            id: `call-${call.id}`,
            label: cadReferenceValue(call),
            detail: [call.incident, call.location].filter(Boolean).join(' · ') || 'Active incident',
            meta: cadPriority(call).toUpperCase(),
            run: () => onSelectCall?.(call),
          })),
      },
      {
        id: 'units',
        title: 'Units',
        items: units
          .filter(unit => matches(unit.unit_number, unit.rank, unit.last_name, unit.full_name, unit.status))
          .slice(0, GROUP_LIMIT)
          .map(unit => ({
            id: `unit-${unit.id || unit.email}`,
            label: [unit.unit_number ? `Unit ${unit.unit_number}` : unit.rank, unit.last_name || unit.full_name].filter(Boolean).join(' ') || 'Officer',
            detail: unit.status || 'Status unknown',
            run: () => onSelectUnit?.(unit),
          })),
      },
      {
        id: 'tools',
        title: 'Workstations',
        items: workstations
          .filter(tool => matches(tool.label, tool.short))
          .slice(0, GROUP_LIMIT)
          .map(tool => ({
            id: `tool-${tool.id}`,
            label: tool.label,
            detail: 'Open workstation',
            run: () => onSelectWorkstation?.(tool),
          })),
      },
    ].filter(group => group.items.length);
  }, [query, calls, units, workstations, commands, onSelectCall, onSelectUnit, onSelectWorkstation]);

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups]);

  useEffect(() => {
    if (active > flat.length - 1) setActive(0);
  }, [flat.length, active]);

  if (!open) return null;

  const choose = item => {
    item?.run();
    onClose?.();
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose?.(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, flat.length - 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); return; }
    if (event.key === 'Enter') { event.preventDefault(); choose(flat[active]); }
  };

  let cursor = -1;
  return (
    <div
      className="cad-palette-backdrop"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <div className="cad-palette" role="dialog" aria-modal="true" aria-label="CAD command palette" onKeyDown={onKeyDown}>
        <label className="cad-palette-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            placeholder="Search incidents, units, workstations and commands"
            aria-label="Search CAD"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="cad-palette-results">
          {groups.map(group => (
            <div key={group.id} className="cad-palette-group">
              <h2>{group.title}</h2>
              {group.items.map(item => {
                cursor += 1;
                const index = cursor;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-selected={active === index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(item)}
                  >
                    <span><b>{item.label}</b><small>{item.detail}</small></span>
                    {item.meta && <em>{item.meta}</em>}
                  </button>
                );
              })}
            </div>
          ))}
          {!flat.length && <p className="cad-palette-empty">No matching incidents, units or workstations.</p>}
        </div>
        <footer>
          <span><CornerDownLeft size={13} /> open</span>
          <span>↑ ↓ navigate</span>
          <span>Esc close</span>
        </footer>
      </div>
    </div>
  );
}