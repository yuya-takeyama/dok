import type { DataSourceProvider, DocumentMetadata, KnowledgeProvider } from "./types";

export class Fetcher {
  constructor(private sourceProviders: DataSourceProvider[]) {}

  async fetchSourceMetadata(): Promise<DocumentMetadata[]> {
    const metadataPromises = this.sourceProviders.map((provider) =>
      provider.fetchDocumentsMetadata(),
    );
    const metadataArrays = await Promise.all(metadataPromises);
    return metadataArrays.flat();
  }

  async fetchTargetMetadata(targetProvider: KnowledgeProvider): Promise<DocumentMetadata[]> {
    return targetProvider.fetchDocumentsMetadata();
  }
}
