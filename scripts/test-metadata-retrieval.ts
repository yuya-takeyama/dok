#!/usr/bin/env tsx

interface MetadataField {
  id: string;
  name: string;
  type: "string" | "number" | "time";
}

interface DifyDocument {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  metadata?: Record<string, any>;
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

  const cleanPath = path.startsWith("/") ? path.substring(1) : path;
  const cleanBaseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const url = new URL(cleanPath, cleanBaseUrl);

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

async function testDocumentsListAPI(): Promise<void> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  console.log("🔍 Testing Documents List API...");
  console.log("📡 GET /datasets/{dataset_id}/documents");

  try {
    const response = await fetchApi(`datasets/${datasetId}/documents?page=1&limit=5`, {
      method: "GET",
    });

    const data: DifyDocumentsResponse = await response.json();
    
    console.log(`📊 Found ${data.total} documents, showing first ${data.data.length}`);
    
    let hasTestMetadata = false;
    
    for (const doc of data.data) {
      console.log(`\n📄 Document: ${doc.name} (ID: ${doc.id})`);
      console.log(`   Created: ${new Date(doc.created_at * 1000).toISOString()}`);
      console.log(`   Updated: ${new Date(doc.updated_at * 1000).toISOString()}`);
      
      if (doc.metadata) {
        console.log("✅ Metadata field exists:");
        console.log("   ", JSON.stringify(doc.metadata, null, 2));
        
        // Check for test values
        if (doc.metadata.source_id?.includes("TEST_") || 
            doc.metadata.provider_id === "TEST_PROVIDER") {
          hasTestMetadata = true;
          console.log("🎯 Found test metadata values!");
        }
      } else {
        console.log("❌ No metadata field in response");
      }
    }
    
    if (!hasTestMetadata) {
      console.log("⚠️ No test metadata values found in documents list");
    }
    
  } catch (error) {
    console.error("❌ Documents List API failed:", error);
  }
}

async function testDocumentDetailAPI(documentId: string): Promise<void> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  console.log("\n🔍 Testing Document Detail API...");
  console.log(`📡 GET /datasets/{dataset_id}/documents/${documentId}`);

  try {
    const response = await fetchApi(`datasets/${datasetId}/documents/${documentId}`, {
      method: "GET",
    });

    const data = await response.json();
    
    console.log("✅ Document Detail API response:");
    console.log(JSON.stringify(data, null, 2));
    
    if (data.metadata) {
      console.log("✅ Metadata found in document detail");
      
      // Check for test values
      if (data.metadata.source_id?.includes("TEST_") || 
          data.metadata.provider_id === "TEST_PROVIDER") {
        console.log("🎯 Found test metadata values in document detail!");
      }
    } else {
      console.log("❌ No metadata in document detail response");
    }
    
  } catch (error) {
    console.error("❌ Document Detail API failed:", error);
    if (error instanceof Error && error.message.includes("404")) {
      console.log("ℹ️  Document detail API endpoint might not exist");
    }
  }
}

async function testMetadataFieldsAPI(): Promise<void> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  console.log("\n🔍 Testing Metadata Fields API...");
  console.log("📡 GET /datasets/{dataset_id}/metadata");

  try {
    const response = await fetchApi(`datasets/${datasetId}/metadata`, {
      method: "GET",
    });

    const data = await response.json();
    
    console.log("✅ Metadata Fields API response:");
    console.log(JSON.stringify(data, null, 2));
    
    const fields: MetadataField[] = data.doc_metadata || data.data || [];
    console.log(`📋 Found ${fields.length} metadata fields:`);
    
    for (const field of fields) {
      console.log(`   - ${field.name} (${field.type}) [ID: ${field.id}]`);
    }
    
  } catch (error) {
    console.error("❌ Metadata Fields API failed:", error);
  }
}

async function testOtherEndpoints(documentId: string): Promise<void> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  console.log("\n🔍 Testing other potential endpoints...");

  // Test document segments endpoint
  console.log("📡 GET /datasets/{dataset_id}/documents/{document_id}/segments");
  try {
    const response = await fetchApi(`datasets/${datasetId}/documents/${documentId}/segments`, {
      method: "GET",
    });

    const data = await response.json();
    console.log("✅ Document segments response:");
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error("❌ Document segments API failed:", error);
  }

  // Test search endpoint (if it exists)
  console.log("\n📡 POST /datasets/{dataset_id}/retrieve");
  try {
    const response = await fetchApi(`datasets/${datasetId}/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "TEST_PROVIDER",
        retrieval_model: {
          search_method: "semantic_search",
          reranking_enable: false,
          top_k: 3,
          score_threshold_enabled: false
        }
      }),
    });

    const data = await response.json();
    console.log("✅ Search/retrieve response:");
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error("❌ Search/retrieve API failed:", error);
  }
}

async function getLatestDocument(): Promise<string | null> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  const response = await fetchApi(`datasets/${datasetId}/documents?page=1&limit=1`, {
    method: "GET",
  });

  const data: DifyDocumentsResponse = await response.json();

  if (data.data.length === 0) {
    return null;
  }

  return data.data[0].id;
}

async function main() {
  try {
    console.log("🔍 Starting comprehensive metadata retrieval test...\n");
    console.log("🎯 Looking for test values: source_id with 'TEST_', provider_id = 'TEST_PROVIDER'\n");

    // Get latest document ID for individual tests
    const documentId = await getLatestDocument();
    if (!documentId) {
      console.log("❌ No documents found to test with");
      return;
    }

    console.log(`🔖 Using document ID for individual tests: ${documentId}\n`);

    // Test all APIs
    await testDocumentsListAPI();
    await testDocumentDetailAPI(documentId);
    await testMetadataFieldsAPI();
    await testOtherEndpoints(documentId);

    console.log("\n📋 Summary:");
    console.log("─".repeat(60));
    console.log("✅ Metadata Fields API: Shows field definitions");
    console.log("🔍 Documents List API: Check if metadata is included");
    console.log("🔍 Document Detail API: Check if endpoint exists and includes metadata");
    console.log("🔍 Other endpoints: Check alternative ways to get metadata");
    console.log("\n🎯 Look for 'TEST_' values and 'TEST_PROVIDER' to confirm metadata retrieval");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// スクリプトを実行
main().catch(console.error);