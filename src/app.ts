import type { CLIOptions } from "./cli.js";
import { getJobConfig, listJobNames, loadConfig } from "./config/index.js";
import { Engine, type EngineOptions } from "./core/engine.js";
import type { DataSourceProvider, KnowledgeProvider } from "./core/types.js";
import { NotionProvider } from "./providers/data_source/notion.js";
import { DifyProvider } from "./providers/knowledge/dify.js";
import { createLogger } from "./utils/logger.js";
import type { TempFileManager } from "./utils/tempfile.js";

// Provider constructors map
const dataSourceProviders = new Map<
  string,
  new (
    config: unknown,
    tempFileManager: TempFileManager,
  ) => DataSourceProvider
>([
  [
    "notion",
    NotionProvider as new (config: unknown, tempFileManager: TempFileManager) => DataSourceProvider,
  ],
]);

const knowledgeProviders = new Map<string, new (config: unknown) => KnowledgeProvider>([
  ["dify", DifyProvider as new (config: unknown) => KnowledgeProvider],
]);

export async function runApp(options: CLIOptions): Promise<void> {
  // Create logger
  const logger = createLogger(options.logLevel);

  // Load configuration
  logger.info("Loading configuration", { configPath: options.config });
  const config = await loadConfig(options.config);

  // Determine which jobs to run
  let jobsToRun: string[];
  if (options.job) {
    // Run specific job
    jobsToRun = [options.job];
    logger.info("Running specific job", { job: options.job });
  } else {
    // Run all jobs
    jobsToRun = listJobNames(config);
    logger.info("Running all jobs", { count: jobsToRun.length });
  }

  // Execute each job
  for (const jobName of jobsToRun) {
    logger.info("Starting job", { jobName });

    try {
      const jobConfig = getJobConfig(config, jobName);

      // Create source providers
      const sourceProviderConfigs = jobConfig.sources.map((source) => ({
        providerId: source.provider,
        provider: source.provider,
        config: source.config,
      }));

      // Create knowledge (target) providers
      const targetProviders: KnowledgeProvider[] = [];
      for (const target of jobConfig.targets) {
        const ProviderClass = knowledgeProviders.get(target.provider);
        if (!ProviderClass) {
          throw new Error(`Unknown knowledge provider: ${target.provider}`);
        }
        const provider = new ProviderClass(target.config);
        targetProviders.push(provider);
      }

      // Create engine options
      const engineOptions: EngineOptions = {
        logger,
        dryRun: options.dryRun,
        jobName,
      };

      // Create and run engine
      const engine = new Engine(
        sourceProviderConfigs,
        targetProviders,
        dataSourceProviders,
        engineOptions,
      );

      await engine.run();

      logger.info("Job completed successfully", { jobName });
    } catch (error) {
      logger.error("Job failed", {
        jobName,
        error: error instanceof Error ? error.message : String(error),
      });

      // If running a single job, propagate the error
      if (options.job) {
        throw error;
      }
      // Otherwise, continue with other jobs
    }
  }

  logger.info("All jobs completed");
}
