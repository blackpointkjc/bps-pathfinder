import { uploadInternalFile } from '@/lib/internalUpload';
import { base44 } from './base44Client';

// Legacy compatibility module. Paid Base44 integration handles are deliberately
// not exported to browser code. AI is routed through the authenticated,
// credit-free internalAssistant backend and files use the audited internal upload.
export const InvokeLLM = async (payload = {}) => {
  const response = await base44.functions.invoke('internalAssistant', payload);
  const data = response?.data || response || {};
  if (data?.error) throw new Error(data.error);
  return data;
};

export const UploadFile = ({ file } = {}) => uploadInternalFile(file);

const blockedPaidIntegration = (name) => async () => {
  throw new Error(`${name} is disabled in the browser. Use the authenticated Pathfinder backend workflow instead.`);
};

export const SendEmail = blockedPaidIntegration('Direct Base44 email');
export const SendSMS = blockedPaidIntegration('Direct Base44 SMS');
export const GenerateImage = blockedPaidIntegration('Direct Base44 image generation');
export const ExtractDataFromUploadedFile = blockedPaidIntegration('Direct Base44 file extraction');

export const Core = {
  InvokeLLM,
  SendEmail,
  SendSMS,
  UploadFile,
  GenerateImage,
  ExtractDataFromUploadedFile,
};
