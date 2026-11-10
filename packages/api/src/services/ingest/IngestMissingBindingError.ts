import { AppError } from '@scholaracle/contracts';
import { INGEST_MISSING_BINDING_CODE } from '@scholaracle/contracts';

export class IngestMissingBindingError extends AppError {
  constructor(message = 'Ingest requires a binding for this source and student') {
    super(message, {
      status: 422,
      code: INGEST_MISSING_BINDING_CODE,
      isOperational: true,
    });
  }
}
