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
            const tempFilePath = join(
              tempDir,
              `${getDocumentId(documentMetadata).replace(/[^a-zA-Z0-9]/g, "_")}.md`,
            );
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
      }

      this.logger.info("Reconciliation completed successfully");
    } catch (error) {
      this.logger.error("Reconciliation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Clean up temporary directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
