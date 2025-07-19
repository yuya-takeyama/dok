import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DocumentMetadata } from "../core/types.js";
import { getDocumentId } from "../core/types.js";

export interface TempFileManager {
  createTempFile(
    metadata: DocumentMetadata,
    content: string | Buffer,
    extension?: string,
  ): Promise<string>;

  cleanup(): Promise<void>;
}

export class TempFileManagerImpl implements TempFileManager {
  private tempDir: string;
  private createdFiles: Set<string> = new Set();

  constructor() {
    this.tempDir = mkdtempSync(join(tmpdir(), "dok-"));
  }

  async createTempFile(
    metadata: DocumentMetadata,
    content: string | Buffer,
    extension?: string,
  ): Promise<string> {
    const documentId = getDocumentId(metadata);
    const hash = createHash("sha256").update(documentId).digest("hex");

    const fileExtension = extension || metadata.fileExtension || "tmp";

    const fileName = `${hash}.${fileExtension}`;
    const filePath = join(this.tempDir, fileName);

    await writeFile(filePath, content);
    this.createdFiles.add(filePath);

    return filePath;
  }

  async cleanup(): Promise<void> {
    await rm(this.tempDir, { recursive: true, force: true });
    this.createdFiles.clear();
  }
}
