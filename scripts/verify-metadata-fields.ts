#!/usr/bin/env tsx

/**
 * Verify that DifyProvider can correctly fetch and cache the new metadata field IDs
 */

interface DifyProviderConfig {
  api_url: string;
  api_key: string;
  dataset_id: string;
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
  headers.set("Content-Type", "application/json");

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

async function testMetadataFieldFetching(datasetId: string) {
  console.log("🔍 Simulating DifyProvider metadata field fetching...");
  
  const metadataFieldIds: Map<string, string> = new Map();
  
  try {
    const response = await fetchApi(`datasets/${datasetId}/metadata`, {
      method: "GET",
    });

    const data = (await response.json()) as {
      doc_metadata?: Array<{ id: string; name: string; type: string }>;
      data?: Array<{ id: string; name: string; type: string }>;
    };
    
    const fields = data.doc_metadata || data.data || [];

    for (const field of fields) {
      metadataFieldIds.set(field.name, field.id);
    }

    console.log(`✅ Loaded ${metadataFieldIds.size} metadata field IDs`);
    
    // Check for our new fields
    const newFields = [
      "dok.data_source_id",
      "dok.data_source_provider_id", 
      "dok.data_source_last_modified"
    ];
    
    console.log("\n🔍 Checking for new metadata fields:");
    let allFound = true;
    
    for (const fieldName of newFields) {
      const fieldId = metadataFieldIds.get(fieldName);
      if (fieldId) {
        console.log(`✅ ${fieldName} → ${fieldId}`);
      } else {
        console.log(`❌ ${fieldName} → NOT FOUND`);
        allFound = false;
      }
    }
    
    if (allFound) {
      console.log("\n🎉 All new metadata fields are available!");
      console.log("✅ The 'No metadata fields found' warning should no longer occur.");
    } else {
      console.log("\n⚠️ Some metadata fields are missing. You may need to run setup-dify-metadata.ts again.");
    }
    
    return allFound;
    
  } catch (error) {
    console.error("❌ Failed to fetch metadata fields:", error);
    return false;
  }
}

async function main() {
  const datasetId = process.env.DIFY_DATASET_ID;

  if (!datasetId) {
    console.error("❌ Missing DIFY_DATASET_ID environment variable");
    process.exit(1);
  }

  console.log("🚀 Verifying metadata field availability");
  console.log(`📊 Dataset ID: ${datasetId}`);
  console.log("─".repeat(60));

  try {
    const success = await testMetadataFieldFetching(datasetId);
    
    if (success) {
      console.log("─".repeat(60));
      console.log("🎉 Verification completed successfully!");
    } else {
      console.log("─".repeat(60));
      console.log("❌ Verification failed. Please check the setup.");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  }
}

// Run the verification
main().catch(console.error);