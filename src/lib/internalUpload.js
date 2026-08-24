import { base44 } from '@/api/base44Client';

const MAX_INTERNAL_FILE_BYTES = 5 * 1024 * 1024;

export async function uploadInternalFile(file) {
  if (!file) throw new Error('A file is required.');
  if (Number(file.size || 0) > MAX_INTERNAL_FILE_BYTES) {
    throw new Error('Files larger than 5 MB must be reduced before upload.');
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read this file.'));
    reader.readAsDataURL(file);
  });

  const response = await base44.functions.invoke('storeInternalFile', {
    data_url: dataUrl,
    name: file.name || 'attachment',
  });
  const payload = response?.data || response || {};
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.file_url) throw new Error('Internal upload did not return a file URL.');
  return payload;
}

export default uploadInternalFile;
