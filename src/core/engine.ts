import { Fetcher } from "./fetcher";
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

  constructor(
    sourceProviders: DataSourceProvider[],
    targetProviders: KnowledgeProvider[],
    private options: EngineOptions = {},
  ) {
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
    const { logger, jobName } = this.options;

    logger?.info("Starting ETL job", { jobName });

    // Step 1: Fetch metadata from sources and targets
    logger?.info("Fetching metadata from sources and targets");
    const [sourceMetadata, targetMetadata] = await Promise.all([
      this.fetcher.fetchSourceMetadata(),
      this.fetcher.fetchTargetMetadata(),
    ]);

    logger?.info("Metadata fetched", {
      sourceCount: sourceMetadata.length,
      targetCount: targetMetadata.length,
    });

    // Step 2: Generate sync plan
    logger?.info("Generating sync plan");
    const plan = this.planner.plan(sourceMetadata, targetMetadata);

    logger?.info("Sync plan generated", {
      summary: plan.summary,
    });

    // Step 3: Execute sync plan
    await this.reconciler.execute(plan);

    logger?.info("ETL job completed", { jobName });
  }
}
