import { Fetcher } from "./fetcher";
import { type Logger, NullLogger } from "./logger";
import { Planner } from "./planner";
import { Reconciler, type ReconcilerOptions } from "./reconciler";
import type { DataSourceProvider, KnowledgeProvider } from "./types";

export interface EngineOptions extends ReconcilerOptions {
  jobName?: string;
}

export class ETLEngine {
  private fetcher: Fetcher;
  private planner: Planner;
  private reconciler: Reconciler;
  private readonly logger: Logger;
  private readonly jobName?: string;

  constructor(
    sourceProviders: DataSourceProvider[],
    targetProviders: KnowledgeProvider[],
    options: EngineOptions = {},
  ) {
    this.logger = options.logger ?? new NullLogger();
    this.jobName = options.jobName;
    this.fetcher = new Fetcher(sourceProviders, targetProviders);
    this.planner = new Planner();

    // Create a map of source providers for reconciler
    const sourceProviderMap = new Map<string, DataSourceProvider>();
    for (const provider of sourceProviders) {
      sourceProviderMap.set(provider.providerId, provider);
    }

    this.reconciler = new Reconciler(sourceProviderMap, targetProviders, options);
  }

  async run(): Promise<void> {
    this.logger.info("Starting ETL job", { jobName: this.jobName });

    // Step 1: Fetch metadata from sources and targets
    this.logger.info("Fetching metadata from sources and targets");
    const [sourceMetadata, targetMetadata] = await Promise.all([
      this.fetcher.fetchSourceMetadata(),
      this.fetcher.fetchTargetMetadata(),
    ]);

    this.logger.info("Metadata fetched", {
      sourceCount: sourceMetadata.length,
      targetCount: targetMetadata.length,
    });

    // Step 2: Generate sync plan
    this.logger.info("Generating sync plan");
    const plan = this.planner.plan(sourceMetadata, targetMetadata);

    this.logger.info("Sync plan generated", {
      summary: plan.summary,
    });

    // Step 3: Execute sync plan
    await this.reconciler.execute(plan);

    this.logger.info("ETL job completed", { jobName: this.jobName });
  }
}
