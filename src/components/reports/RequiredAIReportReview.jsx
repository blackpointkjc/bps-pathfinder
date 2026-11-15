import { useEffect, useRef, useState } from 'react';
import { rewriteOnDevice } from '@/lib/localRewrite';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const skipInputTypes = new Set(['date', 'time', 'datetime-local', 'number', 'email', 'tel', 'checkbox', 'radio', 'file', 'hidden', 'submit', 'button']);
const technicalFieldHints = /(^|_)(id|status|email|phone|date|time|dob|license|plate|signature|report_number|call_number|unit_number|location|site|shift|weather|mileage|patrol_count|visitors_logged|doors_checked|linked_call|photo|officer)($|_)/i;

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function RequiredAIReportReview({ label = 'Review Report', manageSubmit = false, onReviewedChange, extraFields = [], onReviewingChange, reviewRevision }) {
  const buttonRef = useRef(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const form = buttonRef.current?.closest('form');
    if (!form) return;
    form.dataset.aiReviewed = 'false';

    const invalidate = (event) => {
      const target = event.target;
      if (target?.dataset?.aiReviewIgnore === 'true') return;
      const type = String(target?.type || '').toLowerCase();
      const fieldKey = `${target?.name || ''} ${target?.id || ''} ${target?.getAttribute?.('aria-label') || ''}`;
      if (skipInputTypes.has(type) || technicalFieldHints.test(fieldKey)) return;
      setReviewed(false);
      setProgress('');
      form.dataset.aiReviewed = 'false';
      onReviewedChange?.(false);
    };
    const guard = (event) => {
      if (form.dataset.aiReviewed !== 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast.error('AI review is required before this report can be submitted.');
      }
    };
    form.addEventListener('input', invalidate);
    form.addEventListener('change', invalidate);
    if (!manageSubmit) form.addEventListener('submit', guard, true);
    return () => {
      form.removeEventListener('input', invalidate);
      form.removeEventListener('change', invalidate);
      if (!manageSubmit) form.removeEventListener('submit', guard, true);
    };
  }, [manageSubmit, onReviewedChange]);

  const review = async () => {
    const form = buttonRef.current?.closest('form');
    if (!form) return;
    const controls = [...form.querySelectorAll('textarea, input')].filter(el => {
      const type = String(el.type || '').toLowerCase();
      const fieldKey = `${el.name || ''} ${el.id || ''} ${el.getAttribute('aria-label') || ''}`;
      if (skipInputTypes.has(type) || technicalFieldHints.test(fieldKey)) return false;
      return typeof el.value === 'string' && el.value.trim().length >= 2;
    });
    const additional = (extraFields || []).filter(field => String(field?.value || '').trim().length >= 2);
    if (!controls.length && !additional.length) {
      toast.error('Add report narrative details before requesting AI review.');
      return;
    }

    setReviewing(true);
    onReviewingChange?.(true);
    setProgress('Preparing local AI review…');
    try {
      const revisionAtStart = typeof reviewRevision === 'function' ? reviewRevision() : null;
      const originals = controls.map(control => control.value.trim());
      const extraOriginals = additional.map(field => String(field.value).trim());
      // One report-level action runs the on-device model across narrative fields,
      // including DAR hourly entries held in React state rather than text inputs.
      // This keeps report review private and avoids Base44 integration credits.
      const rewritten = [];
      for (let index = 0; index < originals.length; index += 1) {
        rewritten.push({
          index,
          text: await rewriteOnDevice(originals[index], setProgress),
        });
      }
      const rewrittenExtra = [];
      for (let index = 0; index < extraOriginals.length; index += 1) {
        rewrittenExtra.push({
          index,
          text: await rewriteOnDevice(extraOriginals[index], setProgress),
        });
      }
      if (controls.some((control, index) => control.value.trim() !== originals[index])
        || additional.some((field, index) => typeof field.getValue === 'function' && String(field.getValue() || '').trim() !== extraOriginals[index])
        || (typeof reviewRevision === 'function' && reviewRevision() !== revisionAtStart)) {
        throw new Error('The report changed while AI review was running. Your original text was preserved; review the updated report again.');
      }
      rewritten.forEach(item => {
        const control = controls[item.index];
        if (control && item.text) {
          control.dataset.aiReviewIgnore = 'true';
          setNativeValue(control, item.text.trim());
          delete control.dataset.aiReviewIgnore;
        }
      });
      rewrittenExtra.forEach(item => {
        const field = additional[item.index];
        if (field && item.text) field.onChange?.(item.text.trim());
      });
      form.dataset.aiReviewed = 'true';
      setReviewed(true);
      onReviewedChange?.(true);
      toast.success(`AI review complete. ${rewritten.length} report field${rewritten.length === 1 ? '' : 's'} reviewed. Read the revisions before submitting.`);
    } catch (error) {
      form.dataset.aiReviewed = 'false';
      setReviewed(false);
      setProgress('');
      onReviewedChange?.(false);
      toast.error(error?.message || 'Unable to review the report right now.');
    } finally {
      setReviewing(false);
      onReviewingChange?.(false);
    }
  };

  return (
    <div className={`w-full min-w-0 rounded-lg border p-3 sm:p-4 ${reviewed ? 'border-emerald-600/50 bg-emerald-950/20' : 'border-amber-600/50 bg-amber-950/20'}`}>
      <div className="mb-3 flex min-w-0 items-start gap-2 text-sm">
        {reviewed ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100">Required AI Review</p>
          <p className="break-words text-xs leading-5 text-slate-400">Review the suggested wording before submitting. Any later edit requires another review.</p>
        </div>
      </div>
      <Button ref={buttonRef} type="button" onClick={review} disabled={reviewing} className={`h-auto w-full min-w-0 whitespace-normal px-3 py-2 text-center leading-5 sm:w-auto ${reviewed ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-blue-700 hover:bg-blue-600'}`}>
        {reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : reviewed ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {reviewing ? 'Reviewing Report…' : reviewed ? 'AI Review Complete' : label}
      </Button>
      {reviewing && <p role="status" className="mt-2 break-words text-xs text-slate-400">{progress || 'Preparing the local AI model…'}</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">Runs privately on this device. First use downloads and caches the model; no app integration credits are used.</p>
    </div>
  );
}