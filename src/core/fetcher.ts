import type { DataSourceProvider, DocumentMetadata, KnowledgeProvider } from "./types";

export class Fetcher {
  constructor(
    private sourceProviders: DataSourceProvider[],
    private targetProviders: KnowledgeProvider[],
  ) {}

  async fetchSourceMetadata(): Promise<DocumentMetadata[]> {
    const metadataPromises = this.sourceProviders.map((provider) =>
      provider.fetchDocumentsMetadata(),
    );
    const metadataArrays = await Promise.all(metadataPromises);
    return metadataArrays.flat();
  }

  async fetchTargetMetadata(): Promise<DocumentMetadata[]> {
    const metadataPromises = this.targetProviders.map((provider) =>
      provider.fetchDocumentsMetadata(),
    );
    const metadataArrays = await Promise.all(metadataPromises);
    return metadataArrays.flat();
  }
}
