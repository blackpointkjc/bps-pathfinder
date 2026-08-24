import { uploadInternalFile } from '@/lib/internalUpload';
import { base44 } from './base44Client';




export const Core = base44.integrations.Core;

export const InvokeLLM = base44.integrations.Core.InvokeLLM;

export const SendEmail = base44.integrations.Core.SendEmail;

export const SendSMS = base44.integrations.Core.SendSMS;

export const UploadFile = ({ file } = {}) => uploadInternalFile(file);

export const GenerateImage = base44.integrations.Core.GenerateImage;

export const ExtractDataFromUploadedFile = base44.integrations.Core.ExtractDataFromUploadedFile;






