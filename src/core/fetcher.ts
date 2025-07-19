import type { DataSourceProvider, DocumentMetadata, KnowledgeProvider } from "./types";

export class Fetcher {
  constructor(
    private sourceProviders: DataSourceProvider[],
    private targetProviders: KnowledgeProvider[],
  ) {}

  async fetchSourceMetadata(): Promise<DocumentMetadata[]> {
    const allMetadata: DocumentMetadata[] = [];

    for (const provider of this.sourceProviders) {
      const metadata = await provider.fetchDocumentsMetadata();
      allMetadata.push(...metadata);
    }

    return allMetadata;
  }

  async fetchTargetMetadata(): Promise<DocumentMetadata[]> {
    const allMetadata: DocumentMetadata[] = [];

    for (const provider of this.targetProviders) {
      const metadata = await provider.fetchDocumentsMetadata();
      allMetadata.push(...metadata);
    }

    return allMetadata;
  }
}
