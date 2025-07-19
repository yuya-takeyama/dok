import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { type Logger, NullLogger } from "../../core/logger.js";
import type { DataSourceProvider, DocumentMetadata } from "../../core/types.js";
import type { TempFileManager } from "../../utils/tempfile.js";

export interface NotionProviderConfig {
  apiKey: string;
  databaseId: string;
  logger?: Logger;
}

export class NotionProvider implements DataSourceProvider {
  providerId = "notion";
  private client: Client;
  private n2m: NotionToMarkdown;
  private databaseId: string;
  private logger: Logger;

  constructor(
    config: NotionProviderConfig,
    private tempFileManager: TempFileManager,
  ) {
    this.client = new Client({
      auth: config.apiKey,
    });
    this.n2m = new NotionToMarkdown({ notionClient: this.client });
    this.databaseId = config.databaseId;
    this.logger = config.logger ?? new NullLogger();
  }

  async fetchDocumentsMetadata(): Promise<DocumentMetadata[]> {
    const documents: DocumentMetadata[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const response = await this.client.databases.query({
        database_id: this.databaseId,
        start_cursor: startCursor,
      });

      for (const page of response.results) {
        if ("properties" in page && "last_edited_time" in page) {
          const metadata: DocumentMetadata = {
            providerId: this.providerId,
            sourceId: page.id,
            title: this.extractTitle(page.properties),
            lastModified: new Date(page.last_edited_time),
            fileExtension: "md", // Notion content will be converted to Markdown
          };
          documents.push(metadata);
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return documents;
  }

  async downloadDocumentContent(documentId: string): Promise<string> {
    // documentId format: "<providerId>:page_id"
    const pageId = documentId.replace(`${this.providerId}:`, "");

    try {
      // Convert page blocks to markdown
      const mdblocks = await this.n2m.pageToMarkdown(pageId);
      const mdString = this.n2m.toMarkdownString(mdblocks);
      const content = mdString.parent || "";

      // Get metadata for the document
      const page = await this.client.pages.retrieve({ page_id: pageId });
      const metadata: DocumentMetadata = {
        providerId: this.providerId,
        sourceId: pageId,
        title: "properties" in page ? this.extractTitle(page.properties) : "Untitled",
        lastModified: "last_edited_time" in page ? new Date(page.last_edited_time) : new Date(),
        fileExtension: "md",
      };

      // Create temp file using TempFileManager
      return this.tempFileManager.createTempFile(metadata, content);
    } catch (error) {
      // Handle errors (e.g., unsupported blocks, permissions)
      this.logger.error(`Failed to convert page ${pageId} to markdown`, {
        pageId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw error to let Reconciler handle it
      throw new Error(
        `Failed to download content from Notion page ${pageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private extractTitle(properties: Record<string, unknown>): string {
    // Try common property names for title
    const titleFields = ["Title", "title", "Name", "name", "名前", "タイトル"];

    for (const field of titleFields) {
      if (properties[field]) {
        const prop = properties[field] as { type?: string; title?: Array<{ plain_text: string }> };
        if (prop.type === "title" && prop.title && prop.title.length > 0) {
          return prop.title[0].plain_text;
        }
      }
    }

    // If no title field found, try to get the first title type property
    for (const [, value] of Object.entries(properties)) {
      if (value && typeof value === "object" && "type" in value) {
        const titleProp = value as { type?: string; title?: Array<{ plain_text: string }> };
        if (titleProp.type === "title" && titleProp.title && titleProp.title.length > 0) {
          return titleProp.title[0].plain_text;
        }
      }
    }

    return "Untitled";
  }
}
