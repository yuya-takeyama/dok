import { z } from "zod";

// Document metadata schema
export const DocumentMetadataSchema = z.object({
  id: z.string().describe("format: <provider-id>:<original-id>"),
  sourceId: z.string(),
  providerId: z.string(),
  title: z.string(),
  lastModified: z.date(),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

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

// Provider interfaces (these can't be zodified directly, but we can use zod for their configs)
export interface DataSourceProvider {
  providerId: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  fetchDocumentsMetadata(): AsyncIterable<DocumentMetadata> | Promise<DocumentMetadata[]>;
  downloadDocumentContent(documentId: string): Promise<string>;
}

export interface KnowledgeProvider {
  initialize(config: Record<string, unknown>): Promise<void>;
  fetchDocumentsMetadata(): Promise<DocumentMetadata[]>;
  createDocumentFromFile(metadata: DocumentMetadata, filePath: string): Promise<void>;
  updateDocumentFromFile(metadata: DocumentMetadata, filePath: string): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
}
