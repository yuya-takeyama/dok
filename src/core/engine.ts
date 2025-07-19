import { type TempFileManager, TempFileManagerImpl } from "../utils/tempfile.js";
import { createSyncPlan } from "./createSyncPlan";
import { Fetcher } from "./fetcher";
import { type Logger, NullLogger } from "./logger";
import { Reconciler, type ReconcilerOptions, type SourceProviderConfig } from "./reconciler";
import type { DataSourceProvider, KnowledgeProvider } from "./types";

type DataSourceProviderConstructor = new (
  config: unknown,
  tempFileManager: TempFileManager,
) => DataSourceProvider;

export interface EngineOptions extends ReconcilerOptions {
  jobName?: string;
}

export class Engine {
  private fetcher: Fetcher;
  private sourceProviderConfigs: Map<string, SourceProviderConfig>;
  private providerConstructors: Map<string, DataSourceProviderConstructor>;
  private readonly logger: Logger;
  private readonly jobName?: string;

  constructor(
    sourceProviderConfigs: SourceProviderConfig[],
    private readonly targetProviders: KnowledgeProvider[],
    providerConstructors: Map<string, DataSourceProviderConstructor>,
    private readonly options: EngineOptions = {},
  ) {
    this.logger = options.logger ?? new NullLogger();
    this.jobName = options.jobName;
    this.providerConstructors = providerConstructors;

    // Create map of source provider configs
    this.sourceProviderConfigs = new Map<string, SourceProviderConfig>();
    for (const config of sourceProviderConfigs) {
      this.sourceProviderConfigs.set(config.providerId, config);
    }

    // Create source providers with temporary TempFileManager for fetching metadata
    const tempFileManager = new TempFileManagerImpl();
    const sourceProviders: DataSourceProvider[] = [];
    for (const config of sourceProviderConfigs) {
      const ProviderConstructor = this.providerConstructors.get(config.provider);
      if (!ProviderConstructor) {
        throw new Error(`Provider constructor not found: ${config.provider}`);
      }
      const provider = new ProviderConstructor(config.config, tempFileManager);
      sourceProviders.push(provider);
    }

    this.fetcher = new Fetcher(sourceProviders);
  }

  async run(): Promise<void> {
    this.logger.info("Starting sync job", { jobName: this.jobName });

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
      const reconciler = new Reconciler(
        this.sourceProviderConfigs,
        targetProvider,
        this.providerConstructors,
        {
          logger: this.logger,
          dryRun: this.options?.dryRun,
        },
      );
      await reconciler.execute(plan);
    }

    this.logger.info("Sync job completed", { jobName: this.jobName });
  }
}
