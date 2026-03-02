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
    const hash = createHash("sha256").update(documentId).digest("hex").substring(0, 8);

    const fileExtension = extension || metadata.fileExtension || "tmp";

    // ファイル名に使えない文字をサニタイズ
    const sanitizedTitle = metadata.title
      .replace(/[/\\:*?"<>|]/g, "_") // 危険な文字をアンダースコアに置換
      .replace(/\s+/g, " ") // 連続するスペースを1つに
      .trim()
      .substring(0, 200); // 長すぎるタイトルを制限

    // タイトル + ハッシュでユニーク性を保証（メタデータで管理するので見た目はシンプルに）
    const fileName = `${sanitizedTitle}_${hash}.${fileExtension}`;
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
