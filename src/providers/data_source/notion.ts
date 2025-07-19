import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import type { DataSourceProvider, DocumentMetadata } from "../../core/types.js";

export interface NotionProviderConfig {
  apiKey: string;
  databaseId: string;
}

export class NotionProvider implements DataSourceProvider {
  providerId = "notion";
  private client: Client;
  private n2m: NotionToMarkdown;
  private databaseId: string;

  constructor(config: NotionProviderConfig) {
    this.client = new Client({
      auth: config.apiKey,
    });
    this.n2m = new NotionToMarkdown({ notionClient: this.client });
    this.databaseId = config.databaseId;
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
    // documentId format: "notion:page_id"
    const pageId = documentId.replace("notion:", "");

    try {
      // Convert page blocks to markdown
      const mdblocks = await this.n2m.pageToMarkdown(pageId);
      const mdString = this.n2m.toMarkdownString(mdblocks);
      const content = mdString.parent || "";

      // Save to temporary file
      const tempDir = os.tmpdir();
      const tempFileName = `notion_${pageId}_${Date.now()}.md`;
      const tempPath = path.join(tempDir, tempFileName);

      await fs.writeFile(tempPath, content, "utf-8");

      return tempPath; // Return file path instead of content
    } catch (error) {
      // Handle errors (e.g., unsupported blocks, permissions)
      console.error(
        `Failed to convert page ${pageId} to markdown:`,
        error instanceof Error ? error.message : String(error),
      );

      // Return empty file path on error
      const tempDir = os.tmpdir();
      const tempFileName = `notion_${pageId}_${Date.now()}_empty.md`;
      const tempPath = path.join(tempDir, tempFileName);
      await fs.writeFile(tempPath, "", "utf-8");
      return tempPath;
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
