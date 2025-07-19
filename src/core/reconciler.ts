import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DataSourceProvider, KnowledgeProvider, SyncPlan } from "./types";

export interface ReconcilerOptions {
  dryRun?: boolean;
  logger?: {
    info: (message: string, meta?: Record<string, any>) => void;
    error: (message: string, meta?: Record<string, any>) => void;
  };
}

export class Reconciler {
  constructor(
    private sourceProviders: Map<string, DataSourceProvider>,
    private targetProviders: KnowledgeProvider[],
    private options: ReconcilerOptions = {},
  ) {}

  async execute(plan: SyncPlan): Promise<void> {
    const { logger, dryRun = false } = this.options;

    logger?.info("Starting reconciliation", {
      dryRun,
      summary: plan.summary,
    });

    // Create temporary directory for downloads
    const tempDir = await mkdtemp(join(tmpdir(), "dok-"));

    try {
      for (const operation of plan.operations) {
        const { type, documentMetadata, reason } = operation;

        logger?.info(`Processing operation: ${type}`, {
          documentId: documentMetadata.id,
          title: documentMetadata.title,
          reason,
        });

        if (dryRun) {
          logger?.info("Dry run - skipping actual operation");
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

            const content = await sourceProvider.downloadDocumentContent(documentMetadata.id);
            const tempFilePath = join(
              tempDir,
              `${documentMetadata.id.replace(/[^a-zA-Z0-9]/g, "_")}.md`,
            );
            await writeFile(tempFilePath, content, "utf-8");

            // Create or update in target
            for (const targetProvider of this.targetProviders) {
              if (type === "create") {
                await targetProvider.createDocumentFromFile(documentMetadata, tempFilePath);
              } else {
                await targetProvider.updateDocumentFromFile(documentMetadata, tempFilePath);
              }
            }
            break;
          }

          case "delete": {
            // Delete from target
            for (const targetProvider of this.targetProviders) {
              await targetProvider.deleteDocument(documentMetadata.id);
            }
            break;
          }

          case "skip": {
            // Nothing to do
            break;
          }
        }
      }

      logger?.info("Reconciliation completed successfully");
    } catch (error) {
      logger?.error("Reconciliation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Clean up temporary directory
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
