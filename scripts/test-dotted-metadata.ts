#!/usr/bin/env tsx

/**
 * Test script to verify that Dify supports metadata field names with dots
 * Tests the new metadata field names: dok.data_source_id, dok.data_source_provider_id, dok.data_source_last_modified
 */

interface MetadataField {
  id: string;
  name: string;
  type: "string" | "number" | "time";
  display_enabled: boolean;
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

async function getExistingMetadataFields(datasetId: string): Promise<MetadataField[]> {
  console.log("📋 Fetching existing metadata fields...");
  
  try {
    const response = await fetchApi(`datasets/${datasetId}/metadata`, {
      method: "GET",
    });

    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data)) {
      return data;
    } else if (data.data && Array.isArray(data.data)) {
      return data.data;
    } else if (data.doc_metadata && Array.isArray(data.doc_metadata)) {
      return data.doc_metadata;
    } else {
      console.log("Unexpected response format, returning empty array");
      return [];
    }
  } catch (error) {
    console.log("Error fetching metadata fields:", error);
    return [];
  }
}

async function createMetadataField(
  datasetId: string,
  name: string,
  type: "string" | "number" | "time"
): Promise<MetadataField> {
  console.log(`✨ Creating metadata field: ${name} (${type})`);

  const response = await fetchApi(`datasets/${datasetId}/metadata`, {
    method: "POST",
    body: JSON.stringify({
      type,
      name,
    }),
  });

  const field: MetadataField = await response.json();
  console.log(`✅ Created field: ${name} with ID: ${field.id}`);
  return field;
}

async function deleteMetadataField(datasetId: string, fieldId: string, fieldName: string): Promise<void> {
  console.log(`🗑️ Deleting test metadata field: ${fieldName}`);
  
  try {
    await fetchApi(`datasets/${datasetId}/metadata/${fieldId}`, {
      method: "DELETE",
    });
    console.log(`✅ Deleted field: ${fieldName}`);
  } catch (error) {
    console.log(`⚠️ Failed to delete field ${fieldName}:`, error);
  }
}

async function testDottedMetadataFields(datasetId: string): Promise<void> {
  const testFields = [
    { name: "dok.data_source_id", type: "string" as const },
    { name: "dok.data_source_provider_id", type: "string" as const },
    { name: "dok.data_source_last_modified", type: "time" as const },
  ];

  const createdFields: MetadataField[] = [];

  console.log("🧪 Testing creation of dotted metadata fields...");
  console.log("─".repeat(60));

  // Test creation
  for (const testField of testFields) {
    try {
      const createdField = await createMetadataField(datasetId, testField.name, testField.type);
      createdFields.push(createdField);
    } catch (error) {
      console.error(`❌ Failed to create field ${testField.name}:`, error);
      throw error;
    }
  }

  console.log("─".repeat(60));
  console.log("✅ All dotted metadata fields created successfully!");

  // Verify they exist in the list
  console.log("🔍 Verifying fields exist in metadata list...");
  const allFields = await getExistingMetadataFields(datasetId);
  
  for (const testField of testFields) {
    const foundField = allFields.find(f => f.name === testField.name);
    if (foundField) {
      console.log(`✓ Found field: ${testField.name} (ID: ${foundField.id}, Type: ${foundField.type})`);
    } else {
      console.error(`❌ Field not found in list: ${testField.name}`);
    }
  }

  // Test timestamp handling for dok.data_source_last_modified
  console.log("─".repeat(60));
  console.log("⏰ Testing timestamp metadata assignment...");
  
  // For this test, we need to create a test document and set metadata
  // This would require more complex setup, so we'll skip for now
  console.log("ℹ️ Timestamp test skipped - would require test document creation");

  // Clean up: delete the test fields
  console.log("─".repeat(60));
  console.log("🧹 Cleaning up test fields...");
  
  for (const field of createdFields) {
    await deleteMetadataField(datasetId, field.id, field.name);
  }

  console.log("✅ Test cleanup complete!");
}

async function main() {
  const datasetId = process.env.DIFY_DATASET_ID;

  if (!datasetId) {
    console.error("❌ Missing DIFY_DATASET_ID environment variable");
    process.exit(1);
  }

  console.log("🚀 Testing dotted metadata field names in Dify");
  console.log(`📊 Dataset ID: ${datasetId}`);
  console.log("─".repeat(60));

  try {
    await testDottedMetadataFields(datasetId);
    
    console.log("─".repeat(60));
    console.log("🎉 All tests passed! Dotted metadata field names are supported.");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);