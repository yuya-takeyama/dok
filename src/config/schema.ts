import { z } from "zod";

// Provider configuration schemas
export const ProviderConfigSchema = z.object({
  provider: z.string(),
  providerId: z.string().optional(),
  config: z.record(z.string(), z.any()),
});

export const SyncJobSchema = z.object({
  sources: z.array(ProviderConfigSchema),
  targets: z.array(ProviderConfigSchema),
});

export const ConfigSchema = z.object({
  syncJobs: z.record(z.string(), SyncJobSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
export type SyncJob = z.infer<typeof SyncJobSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
