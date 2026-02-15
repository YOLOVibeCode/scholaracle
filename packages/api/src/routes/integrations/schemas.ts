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
      authType: z.enum(['api', 'login']),
      accessToken: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.authType === 'api') return Boolean(data.accessToken?.trim());
        if (data.authType === 'login') return Boolean(data.username?.trim() && data.password);
        return false;
      },
      { message: 'api requires accessToken; login requires username and password' }
    )
    .optional(),
});

export type IAssignStudentBody = z.infer<typeof assignStudentSchema>;
