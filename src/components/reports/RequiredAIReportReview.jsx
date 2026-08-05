import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const narrativeHints = /description|narrative|summary|details|action|reason|statement|observations|notes|circumstances|incident|activity|resolution|property|subject|offense|probable|complaint|maintenance|condition|disposition|finding|damage|door|contact/i;
const skipHints = /email|phone|date|time|number|license|plate|address|location|name|signature|id|status|rank|unit|dob/i;

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function RequiredAIReportReview({ label = 'Review & Professionalize Report' }) {
  const buttonRef = useRef(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    const form = buttonRef.current?.closest('form');
    if (!form) return;
    form.dataset.aiReviewed = 'false';

    const invalidate = (event) => {
      if (event.target?.dataset?.aiReviewIgnore === 'true') return;
      setReviewed(false);
      form.dataset.aiReviewed = 'false';
    };
    const guard = (event) => {
      if (form.dataset.aiReviewed !== 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast.error('AI review is required before this report can be submitted.');
      }
    };
    form.addEventListener('input', invalidate);
    form.addEventListener('submit', guard, true);
    return () => {
      form.removeEventListener('input', invalidate);
      form.removeEventListener('submit', guard, true);
    };
  }, []);

  const review = async () => {
    const form = buttonRef.current?.closest('form');
    if (!form) return;
    const controls = [...form.querySelectorAll('textarea, input[type="text"]')].filter(el => {
      const key = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`;
      const isNarrativeTextarea = el.tagName === 'TEXTAREA' && !skipHints.test(key);
      return el.value?.trim().length >= 3 && (isNarrativeTextarea || narrativeHints.test(key)) && !skipHints.test(key);
    });
    if (!controls.length) {
      toast.error('Add report narrative details before requesting AI review.');
      return;
    }

    setReviewing(true);
    try {
      const fields = controls.map((el, index) => ({
        index,
        field: el.name || el.id || `field_${index}`,
        text: el.value.trim(),
      }));
      const response = await base44.functions.invoke('professionalizeReport', { fields });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      const rewritten = payload.fields || [];
      if (!rewritten.length) throw new Error('The AI review returned no revisions. Please try again.');
      rewritten.forEach(item => {
        const control = controls[item.index];
        if (control && item.text) {
          control.dataset.aiReviewIgnore = 'true';
          setNativeValue(control, item.text.trim());
          delete control.dataset.aiReviewIgnore;
        }
      });
      form.dataset.aiReviewed = 'true';
      setReviewed(true);
      toast.success('AI review complete. Read the revisions before submitting.');
    } catch (error) {
      toast.error(error?.message || 'Unable to review the report right now.');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className={`rounded-lg border p-4 ${reviewed ? 'border-emerald-600/50 bg-emerald-950/20' : 'border-amber-600/50 bg-amber-950/20'}`}>
      <div className="mb-3 flex items-start gap-2 text-sm">
        {reviewed ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />}
        <div>
          <p className="font-semibold text-slate-100">Required AI Review</p>
          <p className="text-xs text-slate-400">The officer must review the rewritten wording. Any later edit requires another review.</p>
        </div>
      </div>
      <Button ref={buttonRef} type="button" onClick={review} disabled={reviewing} className={reviewed ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-blue-700 hover:bg-blue-600'}>
        {reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : reviewed ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {reviewing ? 'Reviewing Report…' : reviewed ? 'AI Review Complete' : label}
      </Button>
    </div>
  );
}
