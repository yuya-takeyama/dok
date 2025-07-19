import { z } from "zod";

// Provider configuration schemas
export const ProviderConfigSchema = z.object({
  provider: z.string(),
  providerId: z.string().optional(),
  config: z.record(z.string(), z.any()),
});

export const JobSchema = z.object({
  sources: z.array(ProviderConfigSchema),
  targets: z.array(ProviderConfigSchema),
});

export const ConfigSchema = z.object({
  jobs: z.record(z.string(), JobSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Job = z.infer<typeof JobSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
