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

/**
 * Credentials for API (OAuth token) only. Portal username/password (authType:'login') is
 * rejected — school portal credentials are held by client devices, never by the server.
 */
export const credentialsSchema = z
  .object({
    authType: z.enum(['api']),
    accessToken: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .refine((data) => Boolean(data.accessToken?.trim()), {
    message: 'api authType requires accessToken',
  });

export type ICredentialsBody = z.infer<typeof credentialsSchema>;
