import { z } from 'zod';

export const addSourceSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  adapterId: z.string().min(1, 'adapterId is required'),
  displayName: z.string().min(1, 'displayName is required'),
  portalBaseUrl: z.string().optional(),
  schedule: z.enum(['hourly', 'every_6h', 'daily', 'manual']).default('every_6h'),
  dataTypes: z.array(z.string()).min(1, 'at least one data type required'),
});

export type IAddSourceBody = z.infer<typeof addSourceSchema>;

export const updateSourceSchema = addSourceSchema.partial().extend({
  enabled: z.boolean().optional(),
});

export type IUpdateSourceBody = z.infer<typeof updateSourceSchema>;
