import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function BrowserRequestDialog({ open, domain, onOpenChange, onSubmit, submitting }) {
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setJustification('');
      setError('');
    }
  }, [open, domain]);

  const submit = async event => {
    event.preventDefault();
    const text = justification.trim();
    if (text.length < 10) {
      setError('Describe the business reason for this request (at least 10 characters).');
      return;
    }
    setError('');
    await onSubmit(text);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request website access</DialogTitle>
          <DialogDescription>
            {domain} is blocked by your browsing profile. Your administrator reviews every request.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="browser-justification" className="text-xs font-semibold text-slate-300">Business justification</label>
            <Textarea
              id="browser-justification"
              value={justification}
              onChange={event => setJustification(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Explain the work purpose for visiting this website."
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-slate-500">{justification.trim().length}/500 characters</p>
          </div>
          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send request'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}