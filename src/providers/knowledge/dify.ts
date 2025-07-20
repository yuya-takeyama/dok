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
  metadata?: Record<string, unknown>;
}

interface DifyDocumentsResponse {
  data: DifyDocument[];
  has_more: boolean;
  page: number;
  limit: number;
  total: number;
}

interface MetadataField {
  id: string;
  name: string;
  type: "string" | "number" | "time";
}

interface DifyDocumentDetail {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  doc_metadata: Array<{
    id: string;
    name: string;
    type: "string" | "number" | "time";
    value: string;
  }>;
}

interface CreateDocumentResponse {
  document: {
    id: string;
    name: string;
    created_at: number;
  };
}

export class DifyProvider implements KnowledgeProvider {
  private baseUrl: string;
  private apiKey: string;
  private datasetId: string;
  private providerId = "dify";
  private metadataFieldIds: Map<string, string> = new Map();

  constructor(config: DifyProviderConfig) {
    this.baseUrl = config.api_url;
    this.apiKey = config.api_key;
    this.datasetId = config.dataset_id;
  }

  private async fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
    // Ensure proper URL concatenation - remove leading slash from path if baseUrl ends with slash
    const cleanPath = path.startsWith("/") ? path.substring(1) : path;
    const cleanBaseUrl = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL(cleanPath, cleanBaseUrl);

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

  private async getMetadataFieldIds(): Promise<void> {
    if (this.metadataFieldIds.size > 0) {
      return; // Already cached
    }

    try {
      const response = await this.fetchApi(`datasets/${this.datasetId}/metadata`, {
        method: "GET",
      });

      const data = (await response.json()) as {
        doc_metadata?: MetadataField[];
        data?: MetadataField[];
      };
      const fields: MetadataField[] = data.doc_metadata || data.data || [];

      for (const field of fields) {
        this.metadataFieldIds.set(field.name, field.id);
      }

      console.log(`Loaded ${this.metadataFieldIds.size} metadata field IDs`);
    } catch (error) {
      console.error("Failed to load metadata field IDs:", error);
    }
  }

  private async fetchDocumentDetail(documentId: string): Promise<DifyDocumentDetail> {
    const response = await this.fetchApi(`datasets/${this.datasetId}/documents/${documentId}`, {
      method: "GET",
    });
    return (await response.json()) as DifyDocumentDetail;
  }

  private async setDocumentMetadata(documentId: string, metadata: DocumentMetadata): Promise<void> {
    await this.getMetadataFieldIds(); // Ensure field IDs are loaded

    const metadataList: Array<{ id: string; name: string; value: string }> = [];

    // Add source_id
    const sourceIdFieldId = this.metadataFieldIds.get("source_id");
    if (sourceIdFieldId) {
      metadataList.push({
        id: sourceIdFieldId,
        name: "source_id",
        value: metadata.sourceId,
      });
    }

    // Add provider_id
    const providerIdFieldId = this.metadataFieldIds.get("provider_id");
    if (providerIdFieldId) {
      metadataList.push({
        id: providerIdFieldId,
        name: "provider_id",
        value: metadata.providerId,
      });
    }

    // Add last_updated
    const lastUpdatedFieldId = this.metadataFieldIds.get("last_updated");
    if (lastUpdatedFieldId) {
      metadataList.push({
        id: lastUpdatedFieldId,
        name: "last_updated",
        value: metadata.lastModified.toISOString(),
      });
    }

    if (metadataList.length === 0) {
      console.warn("No metadata fields found, skipping metadata assignment");
      return;
    }

    try {
      await this.fetchApi(`datasets/${this.datasetId}/documents/metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation_data: [
            {
              document_id: documentId,
              metadata_list: metadataList,
            },
          ],
        }),
      });

      console.log(`Set metadata for document ${documentId}`);
    } catch (error) {
      console.error(`Failed to set metadata for document ${documentId}:`, error);
      // Don't throw - metadata is optional enhancement
    }
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

        const path = `datasets/${this.datasetId}/documents?${params}`;
        const fullUrl = new URL(
          path,
          this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`,
        ).toString();
        console.log(`Fetching documents from Dify: ${fullUrl}`);

        const response = await this.fetchApi(path, {
          method: "GET",
        });

        // Also fetch metadata for each document (if API supports batch metadata fetching)
        // For now, we'll need to fetch metadata individually for each document

        const contentType = response.headers.get("content-type");
        const responseText = await response.text();

        if (!contentType?.includes("application/json")) {
          console.error(
            `Expected JSON but got ${contentType}. Response preview: ${responseText.substring(0, 200)}`,
          );
          throw new Error(
            `Dify API returned non-JSON response. Content-Type: ${contentType}. This usually means the API URL is incorrect or authentication failed.`,
          );
        }

        let data: DifyDocumentsResponse;
        try {
          data = JSON.parse(responseText) as DifyDocumentsResponse;
        } catch (parseError) {
          console.error(`Failed to parse JSON response: ${parseError}`);
          console.error(`Response text: ${responseText.substring(0, 500)}`);
          throw new Error("Failed to parse Dify API response as JSON");
        }

        documents.push(...data.data);
        hasMore = data.has_more;
        page++;
      } catch (error) {
        console.error(`Failed to fetch documents from Dify: ${error}`);
        throw error;
      }
    }

    // Fetch detailed metadata for each document using Document Detail API
    // Process in batches to avoid rate limits
    const batchSize = 10;
    const documentsWithMetadata: DifyDocumentDetail[] = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const detailRequests = batch.map((doc) => this.fetchDocumentDetail(doc.id));
      const batchResults = await Promise.all(detailRequests);
      documentsWithMetadata.push(...batchResults);

      // Optional: Add a small delay between batches to be respectful to the API
      if (i + batchSize < documents.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Convert doc_metadata to DocumentMetadata format
    return documentsWithMetadata.map((doc) => {
      const getMetadataValue = (name: string): string | undefined => {
        return doc.doc_metadata?.find((m) => m.name === name)?.value;
      };

      const providerId = getMetadataValue("provider_id") || this.providerId;
      const sourceId = getMetadataValue("source_id") || doc.id;
      const lastUpdatedStr = getMetadataValue("last_updated");

      // Use metadata last_updated if available, otherwise fall back to doc.updated_at
      const lastModified = lastUpdatedStr
        ? new Date(lastUpdatedStr)
        : new Date(doc.updated_at * 1000);

      return {
        providerId,
        sourceId,
        title: doc.name,
        lastModified,
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

    // Create data object according to API documentation
    const dataObj = {
      indexing_technique: "high_quality",
      process_rule: {
        mode: "automatic",
      },
    };

    // Append data as JSON string
    formData.append("data", JSON.stringify(dataObj));

    try {
      const response = await this.fetchApi(`datasets/${this.datasetId}/document/create_by_file`, {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as CreateDocumentResponse;
      console.log(`Created document: ${metadata.title} with ID: ${result.document.id}`);

      // Set metadata after document creation
      await this.setDocumentMetadata(result.document.id, metadata);
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

    // For update API, process_rule is sent separately as JSON
    const processRule = {
      mode: "automatic",
    };
    formData.append("process_rule", JSON.stringify(processRule));

    try {
      await this.fetchApi(`datasets/${this.datasetId}/documents/${difyDocumentId}/update-by-file`, {
        method: "POST",
        body: formData,
      });
      console.log(`Updated document: ${metadata.title}`);

      // Update metadata after document update
      await this.setDocumentMetadata(difyDocumentId, metadata);
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
      await this.fetchApi(`datasets/${this.datasetId}/documents/${difyDocumentId}`, {
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
    // Get all documents list first
    const documents: DifyDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "100",
        });

        const response = await this.fetchApi(`datasets/${this.datasetId}/documents?${params}`, {
          method: "GET",
        });

        const data = (await response.json()) as DifyDocumentsResponse;
        documents.push(...data.data);
        hasMore = data.has_more;
        page++;
      } catch (error) {
        console.error(`Failed to fetch documents: ${error}`);
        return null;
      }
    }

    // Check each document's metadata using Document Detail API (in batches)
    const batchSize = 10;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const detailRequests = batch.map((doc) => this.fetchDocumentDetail(doc.id));

      try {
        const batchResults = await Promise.all(detailRequests);

        for (const docDetail of batchResults) {
          const docSourceId = docDetail.doc_metadata?.find((m) => m.name === "source_id")?.value;
          if (docSourceId === sourceId) {
            return docDetail.id;
          }
        }
      } catch (error) {
        console.error(`Failed to fetch document details for batch: ${error}`);
        // Continue with next batch instead of failing completely
        continue;
      }

      // Add delay between batches
      if (i + batchSize < documents.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return null;
  }
}
