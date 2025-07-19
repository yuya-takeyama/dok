import { z } from "zod";

// Document metadata schema
export const DocumentMetadataSchema = z.object({
  providerId: z.string(),
  sourceId: z.string(),
  title: z.string(),
  lastModified: z.date(),
  fileExtension: z.string().optional(), // Optional file extension (e.g., "md", "txt", "json")
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

// Helper functions for document ID
export function getDocumentId(metadata: DocumentMetadata): string {
  return `${metadata.providerId}:${metadata.sourceId}`;
}

export function parseDocumentId(id: string): { providerId: string; sourceId: string } {
  const [providerId, ...sourceIdParts] = id.split(":");
  return {
    providerId,
    sourceId: sourceIdParts.join(":"), // Handle sourceIds that contain ':'
  };
}

// Sync operation types
export const SyncOperationTypeSchema = z.enum(["create", "update", "delete", "skip"]);

export const SyncOperationSchema = z.object({
  type: SyncOperationTypeSchema,
  documentMetadata: DocumentMetadataSchema,
  reason: z.string(),
});

export type SyncOperation = z.infer<typeof SyncOperationSchema>;

// Sync plan schema
export const SyncPlanSchema = z.object({
  operations: z.array(SyncOperationSchema),
  summary: z.object({
    total: z.number(),
    create: z.number(),
    update: z.number(),
    delete: z.number(),
    skip: z.number(),
  }),
});

export type SyncPlan = z.infer<typeof SyncPlanSchema>;

// Utility function to extract file extension from sourceId
export function extractExtensionFromSourceId(sourceId: string): string | null {
  const match = sourceId.match(/\.([^./]+)$/);
  return match ? match[1] : null;
}

// Provider interfaces
export interface DataSourceProvider {
  providerId: string;
  fetchDocumentsMetadata(): Promise<DocumentMetadata[]>;
  downloadDocumentContent(documentId: string): Promise<string>;
  getFileExtension?(documentId: string): Promise<string | null>; // Optional method to get file extension
}

export interface KnowledgeProvider {
  fetchDocumentsMetadata(): Promise<DocumentMetadata[]>;
  createDocumentFromFile(metadata: DocumentMetadata, filePath: string): Promise<void>;
  updateDocumentFromFile(metadata: DocumentMetadata, filePath: string): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
}
