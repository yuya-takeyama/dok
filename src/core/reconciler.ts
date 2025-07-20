import { type TempFileManager, TempFileManagerImpl } from "../utils/tempfile.js";
import { type Logger, NullLogger } from "./logger";
import {
  type DataSourceProvider,
  getDocumentId,
  type KnowledgeProvider,
  type SyncOperation,
  type SyncPlan,
} from "./types";

export interface ReconcilerOptions {
  dryRun?: boolean;
  logger?: Logger;
}

export interface SourceProviderConfig {
  providerId: string;
  provider: string;
  config: unknown;
}

type DataSourceProviderConstructor = new (
  config: unknown,
  tempFileManager: TempFileManager,
) => DataSourceProvider;

export class Reconciler {
  private readonly logger: Logger;
  private readonly dryRun: boolean;

  constructor(
    private sourceProviderConfigs: Map<string, SourceProviderConfig>,
    private targetProvider: KnowledgeProvider,
    private providerConstructors: Map<string, DataSourceProviderConstructor>,
    options: ReconcilerOptions = {},
  ) {
    this.logger = options.logger ?? new NullLogger();
    this.dryRun = options.dryRun ?? false;
  }

  async execute(plan: SyncPlan): Promise<void> {
    this.logger.info("Starting reconciliation", {
      dryRun: this.dryRun,
      summary: plan.summary,
    });

    const tempFileManager = new TempFileManagerImpl();
    const errors: Array<{ operation: (typeof plan.operations)[0]; error: Error }> = [];

    try {
      // Create provider instances with TempFileManager injection
      const sourceProviders = new Map<string, DataSourceProvider>();

      for (const [providerId, providerConfig] of this.sourceProviderConfigs) {
        const ProviderConstructor = this.providerConstructors.get(providerConfig.provider);
        if (!ProviderConstructor) {
          throw new Error(`Provider constructor not found: ${providerConfig.provider}`);
        }

        const provider = new ProviderConstructor(providerConfig.config, tempFileManager);
        sourceProviders.set(providerId, provider);
      }

      // Group operations by type for parallel processing
      const createOps = plan.operations.filter((op) => op.type === "create");
      const updateOps = plan.operations.filter((op) => op.type === "update");
      const deleteOps = plan.operations.filter((op) => op.type === "delete");
      const skipOps = plan.operations.filter((op) => op.type === "skip");

      this.logger.info("Operation grouping completed", {
        creates: createOps.length,
        updates: updateOps.length,
        deletes: deleteOps.length,
        skips: skipOps.length,
      });

      // Process skip operations (nothing to do)
      for (const operation of skipOps) {
        this.logger.info("Processing operation: skip", {
          documentId: getDocumentId(operation.documentMetadata),
          title: operation.documentMetadata.title,
          reason: operation.reason,
        });
      }

      // Process create operations in parallel batches
      if (createOps.length > 0) {
        this.logger.info(`Processing ${createOps.length} create operations in parallel`);
        const createErrors = await this.processOperationsBatch(
          createOps,
          "create",
          sourceProviders,
        );
        errors.push(...createErrors);
      }

      // Process update operations in parallel batches
      if (updateOps.length > 0) {
        this.logger.info(`Processing ${updateOps.length} update operations in parallel`);
        const updateErrors = await this.processOperationsBatch(
          updateOps,
          "update",
          sourceProviders,
        );
        errors.push(...updateErrors);
      }

      // Process delete operations in parallel batches
      if (deleteOps.length > 0) {
        this.logger.info(`Processing ${deleteOps.length} delete operations in parallel`);
        const deleteErrors = await this.processOperationsBatch(deleteOps, "delete");
        errors.push(...deleteErrors);
      }

      // Report results
      const successCount = plan.operations.length - errors.length;
      if (errors.length > 0) {
        this.logger.warn("Reconciliation completed with errors", {
          totalOperations: plan.operations.length,
          successCount,
          errorCount: errors.length,
        });

        // Throw aggregated error
        const errorSummary = errors
          .map(
            ({ operation, error }) =>
              `${operation.type} ${getDocumentId(operation.documentMetadata)}: ${error.message}`,
          )
          .join("\n");
        throw new Error(
          `Reconciliation partially failed with ${errors.length} errors:\n${errorSummary}`,
        );
      } else {
        this.logger.info("Reconciliation completed successfully", {
          totalOperations: plan.operations.length,
        });
      }
    } finally {
      // Clean up all temporary files
      await tempFileManager.cleanup();
    }
  }

  private async processOperationsBatch(
    operations: SyncOperation[],
    operationType: "create" | "update" | "delete",
    sourceProviders?: Map<string, DataSourceProvider>,
  ): Promise<Array<{ operation: SyncOperation; error: Error }>> {
    const errors: Array<{ operation: SyncOperation; error: Error }> = [];
    const batchSize = 5; // Fixed batch size for parallel processing

    // Process operations in batches
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);

      this.logger.info(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(operations.length / batchSize)} for ${operationType}`,
        {
          batchSize: batch.length,
          startIndex: i,
        },
      );

      // Process current batch in parallel
      const batchPromises = batch.map((operation) =>
        this.processOperation(operation, operationType, sourceProviders),
      );

      const batchResults = await Promise.allSettled(batchPromises);

      // Collect errors from batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === "rejected") {
          const error =
            result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          errors.push({ operation: batch[j], error });

          this.logger.error(`Failed to process operation: ${operationType}`, {
            documentId: getDocumentId(batch[j].documentMetadata),
            error: error.message,
          });
        }
      }

      // Add small delay between batches to be respectful to the API
      if (i + batchSize < operations.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return errors;
  }

  private async processOperation(
    operation: SyncOperation,
    operationType: "create" | "update" | "delete",
    sourceProviders?: Map<string, DataSourceProvider>,
  ): Promise<void> {
    const { documentMetadata, reason } = operation;

    this.logger.info(`Processing operation: ${operationType}`, {
      documentId: getDocumentId(documentMetadata),
      title: documentMetadata.title,
      reason,
    });

    if (this.dryRun) {
      this.logger.info("Dry run - skipping actual operation");
      return;
    }

    switch (operationType) {
      case "create":
      case "update": {
        if (!sourceProviders) {
          throw new Error("Source providers required for create/update operations");
        }

        // Get source provider and download content
        const sourceProvider = sourceProviders.get(documentMetadata.providerId);
        if (!sourceProvider) {
          throw new Error(`Source provider not found: ${documentMetadata.providerId}`);
        }

        // Provider returns temp file path directly
        const tempFilePath = await sourceProvider.downloadDocumentContent(
          getDocumentId(documentMetadata),
        );

        // Create or update in target
        if (operationType === "create") {
          await this.targetProvider.createDocumentFromFile(documentMetadata, tempFilePath);
        } else {
          await this.targetProvider.updateDocumentFromFile(documentMetadata, tempFilePath);
        }
        break;
      }

      case "delete": {
        // Delete from target
        await this.targetProvider.deleteDocument(getDocumentId(documentMetadata));
        break;
      }
    }
  }
}
