import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { DocumentMetadata, KnowledgeProvider } from "../../core/types.js";
import { parseDocumentId } from "../../core/types.js";

interface DifyProviderConfig {
  api_url: string;
  api_key: string;
  dataset_id: string;
}

interface DifyDocument {
  id: string;
  name: string;
  created_at: number; // Unix timestamp in seconds
  updated_at: number; // Unix timestamp in seconds
}

interface DifyDocumentsResponse {
  data: DifyDocument[];
  has_more: boolean;
  page: number;
  limit: number;
  total: number;
}

export class DifyProvider implements KnowledgeProvider {
  private baseUrl: string;
  private apiKey: string;
  private datasetId: string;
  private providerId = "dify";

  constructor(config: DifyProviderConfig) {
    this.baseUrl = config.api_url;
    this.apiKey = config.api_key;
    this.datasetId = config.dataset_id;
  }

  private async fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
    const url = new URL(path, this.baseUrl);

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);

    const response = await fetch(url.toString(), {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dify API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response;
  }

  async fetchDocumentsMetadata(): Promise<DocumentMetadata[]> {
    const documents: DifyDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "100",
        });

        const response = await this.fetchApi(`/datasets/${this.datasetId}/documents?${params}`, {
          method: "GET",
        });

        const data = (await response.json()) as DifyDocumentsResponse;

        documents.push(...data.data);
        hasMore = data.has_more;
        page++;
      } catch (error) {
        console.error(`Failed to fetch documents from Dify: ${error}`);
        throw new Error(`Failed to fetch documents from Dify: ${error}`);
      }
    }

    return documents.map((doc) => {
      // Extract sourceId from document ID
      // We expect Dify documents to have IDs in format: "provider:sourceId"
      let sourceId = doc.id;

      // If the document ID already contains our provider prefix, extract the actual sourceId
      if (doc.id.startsWith(`${this.providerId}:`)) {
        const parsed = parseDocumentId(doc.id);
        sourceId = parsed.sourceId;
      }

      return {
        providerId: this.providerId,
        sourceId,
        title: doc.name,
        lastModified: new Date(doc.updated_at * 1000), // Convert Unix timestamp to Date
      };
    });
  }

  async createDocumentFromFile(metadata: DocumentMetadata, filePath: string): Promise<void> {
    // Read file content
    const fileContent = readFileSync(filePath);
    const fileName = basename(filePath);

    // Create FormData
    const formData = new FormData();
    const fileBlob = new Blob([fileContent], { type: "application/octet-stream" });
    formData.append("file", fileBlob, fileName);
    formData.append("name", metadata.title);
    formData.append("indexing_technique", "high_quality");

    // Store the original sourceId in the document to maintain traceability
    const documentId = `${metadata.providerId}:${metadata.sourceId}`;
    formData.append("original_document_id", documentId);

    try {
      await this.fetchApi(`/datasets/${this.datasetId}/documents/create_by_file`, {
        method: "POST",
        body: formData,
      });
      console.log(`Created document: ${metadata.title}`);
    } catch (error) {
      console.error(`Failed to create document: ${error}`);
      throw new Error(`Failed to create document: ${error}`);
    }
  }

  async updateDocumentFromFile(metadata: DocumentMetadata, filePath: string): Promise<void> {
    // First, we need to find the Dify document ID from our metadata
    const difyDocumentId = await this.findDifyDocumentId(metadata);

    if (!difyDocumentId) {
      throw new Error(`Document not found in Dify: ${metadata.sourceId}`);
    }

    // Read file content
    const fileContent = readFileSync(filePath);
    const fileName = basename(filePath);

    // Create FormData
    const formData = new FormData();
    const fileBlob = new Blob([fileContent], { type: "application/octet-stream" });
    formData.append("file", fileBlob, fileName);
    formData.append("name", metadata.title);

    try {
      await this.fetchApi(
        `/datasets/${this.datasetId}/documents/${difyDocumentId}/update_by_file`,
        {
          method: "POST",
          body: formData,
        },
      );
      console.log(`Updated document: ${metadata.title}`);
    } catch (error) {
      console.error(`Failed to update document: ${error}`);
      throw new Error(`Failed to update document: ${error}`);
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    const { sourceId } = parseDocumentId(documentId);

    // Find the actual Dify document ID
    const difyDocumentId = await this.findDifyDocumentIdBySourceId(sourceId);

    if (!difyDocumentId) {
      console.warn(`Document not found in Dify, skipping deletion: ${documentId}`);
      return;
    }

    try {
      await this.fetchApi(`/datasets/${this.datasetId}/documents/${difyDocumentId}`, {
        method: "DELETE",
      });
      console.log(`Deleted document: ${documentId}`);
    } catch (error) {
      console.error(`Failed to delete document: ${error}`);
      throw new Error(`Failed to delete document: ${error}`);
    }
  }

  private async findDifyDocumentId(metadata: DocumentMetadata): Promise<string | null> {
    const documents = await this.fetchDocumentsMetadata();
    const targetId = `${metadata.providerId}:${metadata.sourceId}`;

    for (const doc of documents) {
      if (`${doc.providerId}:${doc.sourceId}` === targetId) {
        // Need to get the actual Dify document ID
        // Since we're mapping from our metadata, we need to reverse the process
        return await this.findDifyDocumentIdBySourceId(metadata.sourceId);
      }
    }

    return null;
  }

  private async findDifyDocumentIdBySourceId(sourceId: string): Promise<string | null> {
    // Fetch all documents and find the one matching our sourceId
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "100",
        });

        const response = await this.fetchApi(`/datasets/${this.datasetId}/documents?${params}`, {
          method: "GET",
        });

        const data = (await response.json()) as DifyDocumentsResponse;

        // Look for document with matching sourceId in name or ID
        for (const doc of data.data) {
          if (doc.id === sourceId || doc.id === `${this.providerId}:${sourceId}`) {
            return doc.id;
          }
        }

        hasMore = data.has_more;
        page++;
      } catch (error) {
        console.error(`Failed to search for document: ${error}`);
        return null;
      }
    }

    return null;
  }
}
