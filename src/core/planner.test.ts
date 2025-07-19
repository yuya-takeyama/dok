import { describe, expect, it } from "vitest";
import { Planner } from "./planner";
import type { DocumentMetadata } from "./types";

describe("Planner", () => {
  const planner = new Planner();

  const createMetadata = (id: string, title: string, lastModified: Date): DocumentMetadata => ({
    id,
    sourceId: id.split(":")[1],
    providerId: id.split(":")[0],
    title,
    lastModified,
  });

  it("should create operations for new documents", () => {
    const sourceMetadata: DocumentMetadata[] = [
      createMetadata("notion:doc1", "Document 1", new Date("2024-01-01")),
      createMetadata("notion:doc2", "Document 2", new Date("2024-01-02")),
    ];
    const targetMetadata: DocumentMetadata[] = [];

    const plan = planner.plan(sourceMetadata, targetMetadata);

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[0]).toMatchObject({
      type: "create",
      documentMetadata: sourceMetadata[0],
      reason: "Document does not exist in target",
    });
    expect(plan.operations[1]).toMatchObject({
      type: "create",
      documentMetadata: sourceMetadata[1],
      reason: "Document does not exist in target",
    });
    expect(plan.summary).toEqual({
      total: 2,
      create: 2,
      update: 0,
      delete: 0,
      skip: 0,
    });
  });

  it("should update operations for modified documents", () => {
    const sourceMetadata: DocumentMetadata[] = [
      createMetadata("notion:doc1", "Document 1", new Date("2024-01-02")),
    ];
    const targetMetadata: DocumentMetadata[] = [
      createMetadata("notion:doc1", "Document 1", new Date("2024-01-01")),
    ];

    const plan = planner.plan(sourceMetadata, targetMetadata);

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      type: "update",
      documentMetadata: sourceMetadata[0],
    });
    expect(plan.operations[0].reason).toContain("is newer than target");
    expect(plan.summary.update).toBe(1);
  });

  it("should skip operations for up-to-date documents", () => {
    const date = new Date("2024-01-01");
    const sourceMetadata: DocumentMetadata[] = [createMetadata("notion:doc1", "Document 1", date)];
    const targetMetadata: DocumentMetadata[] = [createMetadata("notion:doc1", "Document 1", date)];

    const plan = planner.plan(sourceMetadata, targetMetadata);

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({
      type: "skip",
      documentMetadata: sourceMetadata[0],
      reason: "Document is up to date",
    });
    expect(plan.summary.skip).toBe(1);
  });

  it("should delete operations for removed documents", () => {
    const sourceMetadata: DocumentMetadata[] = [];
    const targetMetadata: DocumentMetadata[] = [
      createMetadata("notion:doc1", "Document 1", new Date("2024-01-01")),
      createMetadata("notion:doc2", "Document 2", new Date("2024-01-02")),
    ];

    const plan = planner.plan(sourceMetadata, targetMetadata);

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[0]).toMatchObject({
      type: "delete",
      documentMetadata: targetMetadata[0],
      reason: "Document no longer exists in source",
    });
    expect(plan.operations[1]).toMatchObject({
      type: "delete",
      documentMetadata: targetMetadata[1],
      reason: "Document no longer exists in source",
    });
    expect(plan.summary.delete).toBe(2);
  });

  it("should handle mixed operations", () => {
    const sourceMetadata: DocumentMetadata[] = [
      createMetadata("notion:doc1", "Document 1", new Date("2024-01-03")), // update
      createMetadata("notion:doc2", "Document 2", new Date("2024-01-02")), // skip
      createMetadata("notion:doc3", "Document 3", new Date("2024-01-01")), // create
    ];
    const targetMetadata: DocumentMetadata[] = [
      createMetadata("notion:doc1", "Document 1", new Date("2024-01-01")), // will be updated
      createMetadata("notion:doc2", "Document 2", new Date("2024-01-02")), // will be skipped
      createMetadata("notion:doc4", "Document 4", new Date("2024-01-01")), // will be deleted
    ];

    const plan = planner.plan(sourceMetadata, targetMetadata);

    expect(plan.operations).toHaveLength(4);

    // Find operations by type
    const createOps = plan.operations.filter((op) => op.type === "create");
    const updateOps = plan.operations.filter((op) => op.type === "update");
    const deleteOps = plan.operations.filter((op) => op.type === "delete");
    const skipOps = plan.operations.filter((op) => op.type === "skip");

    expect(createOps).toHaveLength(1);
    expect(createOps[0].documentMetadata.id).toBe("notion:doc3");

    expect(updateOps).toHaveLength(1);
    expect(updateOps[0].documentMetadata.id).toBe("notion:doc1");

    expect(skipOps).toHaveLength(1);
    expect(skipOps[0].documentMetadata.id).toBe("notion:doc2");

    expect(deleteOps).toHaveLength(1);
    expect(deleteOps[0].documentMetadata.id).toBe("notion:doc4");

    expect(plan.summary).toEqual({
      total: 4,
      create: 1,
      update: 1,
      delete: 1,
      skip: 1,
    });
  });

  it("should handle empty inputs", () => {
    const plan = planner.plan([], []);

    expect(plan.operations).toHaveLength(0);
    expect(plan.summary).toEqual({
      total: 0,
      create: 0,
      update: 0,
      delete: 0,
      skip: 0,
    });
  });
});
