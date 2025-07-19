import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export class Reconciler {
  private readonly logger: Logger;
  private readonly dryRun: boolean;

  constructor(
    private sourceProviders: Map<string, DataSourceProvider>,
    private targetProvider: KnowledgeProvider,
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

    // Create temporary directory for downloads
    const tempDir = await mkdtemp(join(tmpdir(), "dok-"));
    const errors: Array<{ operation: (typeof plan.operations)[0]; error: Error }> = [];

    try {
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
              // Download content from source
              const sourceProvider = this.sourceProviders.get(documentMetadata.providerId);
              if (!sourceProvider) {
                throw new Error(`Source provider not found: ${documentMetadata.providerId}`);
              }

              const content = await sourceProvider.downloadDocumentContent(
                getDocumentId(documentMetadata),
              );

              // Generate safe filename using SHA256 hash
              const hash = createHash("sha256")
                .update(getDocumentId(documentMetadata))
                .digest("hex");
              const tempFilePath = join(tempDir, `${hash}.md`);

              await writeFile(tempFilePath, content, "utf-8");

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
      // Clean up temporary directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
