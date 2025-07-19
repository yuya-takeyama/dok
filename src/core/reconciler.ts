import { type TempFileManager, TempFileManagerImpl } from "../utils/tempfile.js";
import { type Logger, NullLogger } from "./logger";
import {
  type DataSourceProvider,
  getDocumentId,
  type KnowledgeProvider,
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

      for (const operation of plan.operations) {
        const { type, documentMetadata, reason } = operation;

        this.logger.info(`Processing operation: ${type}`, {
          documentId: getDocumentId(documentMetadata),
          title: documentMetadata.title,
          reason,
        });

        if (this.dryRun) {
          this.logger.info("Dry run - skipping actual operation");
          continue;
        }

        try {
          switch (type) {
            case "create":
            case "update": {
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
              if (type === "create") {
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

            case "skip": {
              // Nothing to do
              break;
            }
          }
        } catch (error) {
          // Collect error but continue processing other operations
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push({ operation, error: err });

          this.logger.error(`Failed to process operation: ${type}`, {
            documentId: getDocumentId(documentMetadata),
            error: err.message,
          });
        }
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
}
