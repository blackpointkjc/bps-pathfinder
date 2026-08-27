import { useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { uploadInternalFile } from '@/lib/internalUpload';

const ALLOWED_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/heic','image/heif',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 12;

export function BoloAttachmentsEditor({ attachments = [], onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const upload = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setError('');
    if (attachments.length + files.length > MAX_FILES) {
      setError(`A BOLO can contain up to ${MAX_FILES} additional attachments.`);
      return;
    }
    const unsupported = files.find(file => !ALLOWED_TYPES.has(String(file.type || '').toLowerCase()));
    if (unsupported) {
      setError(`${unsupported.name} is not a supported JPG, PNG, WEBP, HEIC, PDF, DOC, DOCX, or TXT file.`);
      return;
    }
    const oversized = files.find(file => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setError(`${oversized.name} is larger than 15 MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const result = await uploadInternalFile(file);
        if (!result?.file_url) throw new Error(`Upload failed for ${file.name}.`);
        uploaded.push({
          name: file.name,
          url: result.file_url,
          mime_type: file.type,
          size: file.size,
          kind: file.type.startsWith('image/') ? 'image' : 'document',
          uploaded_at: new Date().toISOString(),
        });
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      onChange([...attachments, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError?.message || 'Attachment upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded border border-slate-700 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-slate-300"><Paperclip className="h-3 w-3" />FILES / DOCUMENTS</div>
        <input ref={inputRef} type="file" multiple className="sr-only" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.doc,.docx,.txt" onChange={upload} disabled={uploading} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || attachments.length >= MAX_FILES} className="rounded border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-[9px] font-bold text-blue-300 disabled:opacity-50">
          <Upload className="mr-1 inline h-3 w-3" />{uploading ? `UPLOADING ${progress}%` : 'ADD FILES'}
        </button>
      </div>
      {uploading && <div className="mb-3 h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} /></div>}
      {error && <div role="alert" className="mb-3 rounded border border-red-700/60 bg-red-950/30 px-3 py-2 text-[10px] font-bold text-red-300">{error}</div>}
      {!attachments.length ? <p className="text-[10px] text-slate-600">Add photographs, PDFs, Word documents, or text files. Existing BOLO photos remain separate.</p> : (
        <div className="space-y-2">
          {attachments.map((file, index) => (
            <div key={`${file.url}-${index}`} className="flex items-center gap-3 rounded border border-slate-700 bg-slate-900/60 p-2">
              {file.kind === 'image' ? <ImageIcon className="h-4 w-4 text-blue-300" /> : <FileText className="h-4 w-4 text-amber-300" />}
              <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-white">{file.name}</div><div className="text-[9px] text-slate-500">{file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Uploaded file'}</div></div>
              {file.kind === 'image' && <img src={file.url} alt="" className="h-10 w-10 rounded object-cover" />}
              <button type="button" onClick={() => onChange(attachments.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-red-300 hover:bg-red-950/40" aria-label={`Remove ${file.name}`}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BoloAttachmentList({ attachments = [] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-5 border-t border-red-800/50 pt-4 print:hidden">
      <b className="text-xs text-red-400">ATTACHED FILES</b>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {attachments.map((file, index) => (
          <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer" download={file.name || undefined} className="flex min-h-11 items-center gap-3 rounded border border-slate-700 bg-slate-900/60 p-3 text-xs text-white hover:border-blue-500">
            {file.kind === 'image' ? <ImageIcon className="h-4 w-4 text-blue-300" /> : <FileText className="h-4 w-4 text-amber-300" />}
            <span className="min-w-0 flex-1 truncate">{file.name || 'BOLO attachment'}</span><Download className="h-4 w-4" />
          </a>
        ))}
      </div>
    </div>
  );
}
