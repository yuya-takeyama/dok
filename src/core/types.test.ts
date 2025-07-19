import { describe, expect, it } from "vitest";
import {
  type DocumentMetadata,
  extractExtensionFromSourceId,
  getDocumentId,
  parseDocumentId,
} from "./types";

describe("types utility functions", () => {
  describe("getDocumentId", () => {
    it("should create document ID from metadata", () => {
      const metadata: DocumentMetadata = {
        providerId: "notion",
        sourceId: "page123",
        title: "Test Document",
        lastModified: new Date("2024-01-01"),
      };

      const result = getDocumentId(metadata);

      expect(result).toBe("notion:page123");
    });

    it("should handle special characters in sourceId", () => {
      const metadata: DocumentMetadata = {
        providerId: "github",
        sourceId: "repo/file:with:colons.md",
        title: "Test Document",
        lastModified: new Date("2024-01-01"),
      };

      const result = getDocumentId(metadata);

      expect(result).toBe("github:repo/file:with:colons.md");
    });
  });

  describe("parseDocumentId", () => {
    it("should parse simple document ID", () => {
      const result = parseDocumentId("notion:page123");

      expect(result).toEqual({
        providerId: "notion",
        sourceId: "page123",
      });
    });

    it("should handle sourceId with colons", () => {
      const result = parseDocumentId("github:repo/file:with:colons.md");

      expect(result).toEqual({
        providerId: "github",
        sourceId: "repo/file:with:colons.md",
      });
    });

    it("should handle single colon", () => {
      const result = parseDocumentId("provider:");

      expect(result).toEqual({
        providerId: "provider",
        sourceId: "",
      });
    });

    it("should handle no colon (edge case)", () => {
      const result = parseDocumentId("invalidformat");

      expect(result).toEqual({
        providerId: "invalidformat",
        sourceId: "",
      });
    });
  });

  describe("extractExtensionFromSourceId", () => {
    it("should extract common file extensions", () => {
      expect(extractExtensionFromSourceId("document.md")).toBe("md");
      expect(extractExtensionFromSourceId("file.txt")).toBe("txt");
      expect(extractExtensionFromSourceId("data.json")).toBe("json");
      expect(extractExtensionFromSourceId("image.png")).toBe("png");
    });

    it("should handle files with multiple dots", () => {
      expect(extractExtensionFromSourceId("config.local.yaml")).toBe("yaml");
      expect(extractExtensionFromSourceId("backup.2024.01.01.sql")).toBe("sql");
    });

    it("should handle files with no extension", () => {
      expect(extractExtensionFromSourceId("README")).toBeNull();
      expect(extractExtensionFromSourceId("Makefile")).toBeNull();
    });

    it("should handle hidden files", () => {
      expect(extractExtensionFromSourceId(".gitignore")).toBe("gitignore");
      expect(extractExtensionFromSourceId(".env.local")).toBe("local");
    });

    it("should handle paths", () => {
      expect(extractExtensionFromSourceId("path/to/file.md")).toBe("md");
      expect(extractExtensionFromSourceId("/absolute/path/document.txt")).toBe("txt");
    });

    it("should handle edge cases", () => {
      expect(extractExtensionFromSourceId("")).toBeNull();
      expect(extractExtensionFromSourceId(".")).toBeNull();
      expect(extractExtensionFromSourceId("..")).toBeNull();
      expect(extractExtensionFromSourceId("file.")).toBeNull();
    });
  });
});
