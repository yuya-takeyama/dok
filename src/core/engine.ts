import { createSyncPlan } from "./createSyncPlan";
import { Fetcher } from "./fetcher";
import { type Logger, NullLogger } from "./logger";
import { Reconciler, type ReconcilerOptions } from "./reconciler";
import type { DataSourceProvider, KnowledgeProvider } from "./types";

export interface EngineOptions extends ReconcilerOptions {
  jobName?: string;
}

export class ETLEngine {
  private fetcher: Fetcher;
  private sourceProviderMap: Map<string, DataSourceProvider>;
  private readonly logger: Logger;
  private readonly jobName?: string;

  constructor(
    sourceProviders: DataSourceProvider[],
    private readonly targetProviders: KnowledgeProvider[],
    private readonly options: EngineOptions = {},
  ) {
    this.logger = options.logger ?? new NullLogger();
    this.jobName = options.jobName;
    this.fetcher = new Fetcher(sourceProviders);

    // Create a map of source providers for reconciler
    this.sourceProviderMap = new Map<string, DataSourceProvider>();
    for (const provider of sourceProviders) {
      this.sourceProviderMap.set(provider.providerId, provider);
    }
  }

  async run(): Promise<void> {
    this.logger.info("Starting ETL job", { jobName: this.jobName });

    // Step 1: Fetch metadata from sources (desired state)
    this.logger.info("Fetching metadata from sources");
    const sourceMetadata = await this.fetcher.fetchSourceMetadata();

    this.logger.info("Source metadata fetched", {
      sourceCount: sourceMetadata.length,
    });

    // Step 2: Process each target individually
    for (const targetProvider of this.targetProviders) {
      this.logger.info("Processing target provider");

      // Fetch current state for this target
      const targetMetadata = await this.fetcher.fetchTargetMetadata(targetProvider);

      this.logger.info("Target metadata fetched", {
        targetCount: targetMetadata.length,
      });

      // Generate sync plan for this target
      this.logger.info("Generating sync plan for target");
      const plan = createSyncPlan(sourceMetadata, targetMetadata);

      this.logger.info("Sync plan generated for target", {
        summary: plan.summary,
      });

      // Execute sync plan for this target
      const reconciler = new Reconciler(this.sourceProviderMap, [targetProvider], {
        logger: this.logger,
        dryRun: this.options?.dryRun,
      });
      await reconciler.execute(plan);
    }

    this.logger.info("ETL job completed", { jobName: this.jobName });
  }
}
