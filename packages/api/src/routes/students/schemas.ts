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

/** Credentials for API (token) or login (username/password) to scrape. */
export const credentialsSchema = z
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
  );

export type ICredentialsBody = z.infer<typeof credentialsSchema>;
