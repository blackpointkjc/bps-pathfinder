let activeDialog = null;

function closeActiveDialog(value) {
  if (!activeDialog) return;
  const { overlay, resolve, cleanup } = activeDialog;
  activeDialog = null;
  cleanup();
  overlay.remove();
  resolve(value);
}

function showDialog({ title, message, confirmLabel, cancelLabel, destructive = false, inputValue }) {
  if (activeDialog) closeActiveDialog(null);

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm';
    overlay.setAttribute('role', 'presentation');

    const panel = document.createElement('section');
    panel.className = 'w-full max-w-md overflow-hidden rounded-2xl border border-slate-600 bg-[#0b1725] text-slate-100 shadow-2xl';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'pathfinder-dialog-title');

    const header = document.createElement('div');
    header.className = 'border-b border-slate-700 bg-[#101f30] px-5 py-4';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'text-[10px] font-black uppercase tracking-[0.2em] text-blue-300';
    eyebrow.textContent = 'Pathfinder';

    const heading = document.createElement('h2');
    heading.id = 'pathfinder-dialog-title';
    heading.className = 'mt-1 text-lg font-black text-white';
    heading.textContent = title || 'Confirm action';

    header.append(eyebrow, heading);

    const body = document.createElement('div');
    body.className = 'px-5 py-5';

    const copy = document.createElement('p');
    copy.className = 'whitespace-pre-wrap text-sm leading-6 text-slate-300';
    copy.textContent = String(message || '');
    body.append(copy);

    let input = null;
    if (inputValue !== undefined) {
      input = document.createElement('input');
      input.type = 'text';
      input.value = String(inputValue || '');
      input.className = 'mt-4 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-sm text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30';
      input.setAttribute('aria-label', title || 'Enter a value');
      body.append(input);
    }

    const actions = document.createElement('div');
    actions.className = 'flex flex-col-reverse gap-2 border-t border-slate-700 bg-[#08111f] px-5 py-4 sm:flex-row sm:justify-end';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'min-h-11 rounded-xl border border-slate-600 bg-slate-800 px-5 text-sm font-black text-slate-100 hover:bg-slate-700';
    cancel.textContent = cancelLabel || 'Cancel';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = destructive
      ? 'min-h-11 rounded-xl border border-red-400 bg-red-600 px-5 text-sm font-black text-white hover:bg-red-500'
      : 'min-h-11 rounded-xl border border-blue-400 bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500';
    confirm.textContent = confirmLabel || 'Confirm';

    actions.append(cancel, confirm);
    panel.append(header, body, actions);
    overlay.append(panel);
    document.body.append(overlay);

    const finish = accepted => closeActiveDialog(
      input ? (accepted ? input.value : null) : Boolean(accepted)
    );
    const onKeyDown = event => {
      if (event.key === 'Escape') finish(false);
      if (event.key === 'Enter' && (input || document.activeElement === confirm)) finish(true);
    };
    const cleanup = () => document.removeEventListener('keydown', onKeyDown, true);

    activeDialog = { overlay, resolve, cleanup };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKeyDown, true);

    requestAnimationFrame(() => (input || cancel).focus());
  });
}

export function confirmInApp(message, options = {}) {
  return showDialog({
    title: options.title || 'Confirm action',
    message,
    confirmLabel: options.confirmLabel || 'Confirm',
    cancelLabel: options.cancelLabel || 'Cancel',
    destructive: options.destructive ?? /delete|remove|clear|inactive|terminate/i.test(String(message || '')),
  });
}

export function promptInApp(message, defaultValue = '', options = {}) {
  return showDialog({
    title: options.title || 'Enter information',
    message,
    confirmLabel: options.confirmLabel || 'Save',
    cancelLabel: options.cancelLabel || 'Cancel',
    inputValue: defaultValue,
  });
}
