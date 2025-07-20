#!/usr/bin/env tsx

/**
 * Delete all documents from Dify Knowledge Base
 * WARNING: This will delete ALL documents in the dataset!
 */

interface DifyDocument {
  id: string;
  name: string;
}

interface DifyDocumentsResponse {
  data: DifyDocument[];
  has_more: boolean;
  page: number;
  limit: number;
  total: number;
}

async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  const apiUrl = process.env.DIFY_API_URL;
  const apiKey = process.env.DIFY_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error("Missing required environment variables: DIFY_API_URL, DIFY_API_KEY");
  }

  const url = new URL(path, apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);

  const response = await fetch(url.toString(), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Dify API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response;
}

async function deleteAllDocuments(datasetId: string) {
  console.log("🗑️  Fetching all documents to delete...");
  
  const allDocuments: DifyDocument[] = [];
  let page = 1;
  let hasMore = true;

  // Fetch all documents
  while (hasMore) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: "100",
    });

    try {
      const response = await fetchApi(`datasets/${datasetId}/documents?${params}`, {
        method: "GET",
      });

      const data: DifyDocumentsResponse = await response.json();
      allDocuments.push(...data.data);
      hasMore = data.has_more;
      page++;
    } catch (error) {
      console.error("❌ Error fetching documents:", error);
      process.exit(1);
    }
  }

  console.log(`📚 Found ${allDocuments.length} documents to delete`);

  if (allDocuments.length === 0) {
    console.log("✅ No documents to delete");
    return;
  }

  // Confirm deletion
  console.log("\n⚠️  WARNING: This will delete ALL documents!");
  console.log("Press Ctrl+C to cancel, or wait 3 seconds to continue...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Delete each document
  for (const doc of allDocuments) {
    try {
      await fetchApi(`datasets/${datasetId}/documents/${doc.id}`, {
        method: "DELETE",
      });
      console.log(`✅ Deleted: ${doc.name}`);
    } catch (error) {
      console.error(`❌ Failed to delete ${doc.name}:`, error);
    }
  }

  console.log("\n🎉 Deletion complete!");
}

async function main() {
  const datasetId = process.env.DIFY_DATASET_ID;

  if (!datasetId) {
    console.error("❌ Missing DIFY_DATASET_ID environment variable");
    process.exit(1);
  }

  await deleteAllDocuments(datasetId);
}

// Run the script
main().catch(console.error);