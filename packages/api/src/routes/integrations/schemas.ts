import { z } from 'zod';

export const createIntegrationSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  adapterId: z.string().min(1, 'adapterId is required'),
  displayName: z.string().min(1, 'displayName is required'),
  portalBaseUrl: z.string().optional(),
  schedule: z.enum(['hourly', 'every_6h', 'daily', 'manual']).default('every_6h'),
  dataTypes: z
    .array(z.string())
    .min(1, 'at least one data type required')
    .default(['grades', 'assignments', 'calendar']),
  enabled: z.boolean().optional().default(true),
});

export type ICreateIntegrationBody = z.infer<typeof createIntegrationSchema>;

export const updateIntegrationSchema = createIntegrationSchema.partial();

export type IUpdateIntegrationBody = z.infer<typeof updateIntegrationSchema>;

export const assignStudentSchema = z.object({
  credentials: z
    .object({
      authType: z.enum(['api']),
      accessToken: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .refine((data) => Boolean(data.accessToken?.trim()), {
      message: 'api authType requires accessToken',
    })
    .optional(),
});

export type IAssignStudentBody = z.infer<typeof assignStudentSchema>;

export const testConnectionSchema = z.object({
  provider: z.string().min(1, 'provider is required'),
  adapterId: z.string().min(1, 'adapterId is required'),
  baseUrl: z.string().optional(),
  credentials: z.object({
    authType: z.enum(['api', 'oauth2', 'api-key']),
    accessToken: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    apiKey: z.string().optional(),
  }),
});

export type ITestConnectionBody = z.infer<typeof testConnectionSchema>;
