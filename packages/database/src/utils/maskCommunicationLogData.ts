import { maskPiiDeep } from '@scholaracle/contracts';
import type { ICommunicationLogData } from '../models/CommunicationLog';

/** Apply PII masking before persisting a communication log. */
export function maskCommunicationLogData(data: ICommunicationLogData): ICommunicationLogData {
  return maskPiiDeep(data) as ICommunicationLogData;
}
