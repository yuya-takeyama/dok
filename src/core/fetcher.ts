import type { DataSourceProvider, DocumentMetadata, KnowledgeProvider } from "./types";

export class Fetcher {
  constructor(
    private sourceProviders: DataSourceProvider[],
    private targetProviders: KnowledgeProvider[],
  ) {}

  async fetchSourceMetadata(): Promise<DocumentMetadata[]> {
    const allMetadata: DocumentMetadata[] = [];

    for (const provider of this.sourceProviders) {
      const result = await provider.fetchDocumentsMetadata();

      // Handle both AsyncIterator and Promise<DocumentMetadata[]>
      if (Symbol.asyncIterator in result) {
        for await (const metadata of result) {
          allMetadata.push(metadata);
        }
      } else {
        allMetadata.push(...(await result));
      }
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
