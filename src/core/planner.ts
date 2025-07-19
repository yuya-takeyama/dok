import { type DocumentMetadata, getDocumentId, type SyncOperation, type SyncPlan } from "./types";

export class Planner {
  plan(sourceMetadata: DocumentMetadata[], targetMetadata: DocumentMetadata[]): SyncPlan {
    const operations: SyncOperation[] = [];
    const targetMap = new Map<string, DocumentMetadata>();

    // Build a map of target documents by ID
    for (const target of targetMetadata) {
      targetMap.set(getDocumentId(target), target);
    }

    // Check for creates and updates
    for (const source of sourceMetadata) {
      const target = targetMap.get(getDocumentId(source));

      if (!target) {
        // Document doesn't exist in target - create
        operations.push({
          type: "create",
          documentMetadata: source,
          reason: "Document does not exist in target",
        });
      } else if (source.lastModified > target.lastModified) {
        // Source is newer - update
        operations.push({
          type: "update",
          documentMetadata: source,
          reason: `Source modified at ${source.lastModified.toISOString()} is newer than target modified at ${target.lastModified.toISOString()}`,
        });
      } else {
        // No changes needed - skip
        operations.push({
          type: "skip",
          documentMetadata: source,
          reason: "Document is up to date",
        });
      }

      // Mark as processed
      targetMap.delete(getDocumentId(source));
    }

    // Check for deletes - remaining items in targetMap
    for (const [_, target] of targetMap) {
      operations.push({
        type: "delete",
        documentMetadata: target,
        reason: "Document no longer exists in source",
      });
    }

    // Calculate summary
    const summary = {
      total: operations.length,
      create: operations.filter((op) => op.type === "create").length,
      update: operations.filter((op) => op.type === "update").length,
      delete: operations.filter((op) => op.type === "delete").length,
      skip: operations.filter((op) => op.type === "skip").length,
    };

    return {
      operations,
      summary,
    };
  }
}
