import { z } from 'zod';

export const portalAccountUpsertSchema = z.object({
  provider: z.string().min(1),
  adapterId: z.string().min(1),
  portalBaseUrl: z.string().min(1),
  institutionExternalId: z.string().min(1),
  displayName: z.string().min(1),
});

export const portalBindingUpsertSchema = z.object({
  studentId: z.string().min(1),
  sourceId: z.string().min(1),
  studentExternalId: z.string().min(1),
});
