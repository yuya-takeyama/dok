import { createReadStream } from "node:fs";
import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
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
  private client: AxiosInstance;
  private datasetId: string;
  private providerId = "dify";

  constructor(config: DifyProviderConfig) {
    this.datasetId = config.dataset_id;
    this.client = axios.create({
      baseURL: config.api_url,
      headers: {
        Authorization: `Bearer ${config.api_key}`,
      },
    });
  }

  async fetchDocumentsMetadata(): Promise<DocumentMetadata[]> {
    const documents: DifyDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get<DifyDocumentsResponse>(
          `/datasets/${this.datasetId}/documents`,
          {
            params: {
              page,
              limit: 100,
            },
          },
        );

        documents.push(...response.data.data);
        hasMore = response.data.has_more;
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
    const formData = new FormData();
    formData.append("file", createReadStream(filePath));
    formData.append("name", metadata.title);
    formData.append("indexing_technique", "high_quality");

    // Store the original sourceId in the document to maintain traceability
    const documentId = `${metadata.providerId}:${metadata.sourceId}`;
    formData.append("original_document_id", documentId);

    try {
      await this.client.post(`/datasets/${this.datasetId}/documents/create_by_file`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
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

    const formData = new FormData();
    formData.append("file", createReadStream(filePath));
    formData.append("name", metadata.title);

    try {
      await this.client.post(
        `/datasets/${this.datasetId}/documents/${difyDocumentId}/update_by_file`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
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
      await this.client.delete(`/datasets/${this.datasetId}/documents/${difyDocumentId}`);
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
        const response = await this.client.get<DifyDocumentsResponse>(
          `/datasets/${this.datasetId}/documents`,
          {
            params: {
              page,
              limit: 100,
            },
          },
        );

        // Look for document with matching sourceId in name or ID
        for (const doc of response.data.data) {
          if (doc.id === sourceId || doc.id === `${this.providerId}:${sourceId}`) {
            return doc.id;
          }
        }

        hasMore = response.data.has_more;
        page++;
      } catch (error) {
        console.error(`Failed to search for document: ${error}`);
        return null;
      }
    }

    return null;
  }
}
