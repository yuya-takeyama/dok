#!/usr/bin/env tsx

/**
 * Setup script to create metadata fields in Dify Knowledge Base
 * Run this once before using the sync functionality
 */

interface MetadataField {
  id: string;
  name: string;
  type: "string" | "number" | "time";
  display_enabled: boolean;
}

interface MetadataListResponse {
  has_more: boolean;
  page: number;
  limit: number;
  total: number;
  data: MetadataField[];
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
    console.log("Response data:", JSON.stringify(data, null, 2));
    
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
    // If endpoint doesn't exist or returns error, assume no fields exist
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

async function main() {
  const datasetId = process.env.DIFY_DATASET_ID;

  if (!datasetId) {
    console.error("❌ Missing DIFY_DATASET_ID environment variable");
    process.exit(1);
  }

  console.log("🚀 Setting up Dify metadata fields for dataset:", datasetId);
  console.log("─".repeat(60));

  try {
    // Get existing fields
    const existingFields = await getExistingMetadataFields(datasetId);
    console.log(`📊 Found ${existingFields.length} existing metadata fields`);

    // Check if our required fields already exist
    const sourceIdField = existingFields.find((f) => f.name === "source_id");
    const lastUpdatedField = existingFields.find((f) => f.name === "last_updated");
    const providerIdField = existingFields.find((f) => f.name === "provider_id");

    console.log("─".repeat(60));

    // Create missing fields
    const fieldsToCreate: Array<{ name: string; type: "string" | "number" | "time"; exists: boolean }> = [
      { name: "source_id", type: "string", exists: !!sourceIdField },
      { name: "provider_id", type: "string", exists: !!providerIdField },
      { name: "last_updated", type: "time", exists: !!lastUpdatedField },
    ];

    for (const field of fieldsToCreate) {
      if (field.exists) {
        console.log(`✓ Field "${field.name}" already exists`);
      } else {
        await createMetadataField(datasetId, field.name, field.type);
      }
    }

    console.log("─".repeat(60));
    console.log("🎉 Metadata setup complete!");

    // Display current state
    const finalFields = await getExistingMetadataFields(datasetId);
    console.log("\n📋 Current metadata fields:");
    finalFields.forEach((field) => {
      console.log(`  - ${field.name} (${field.type}) - ID: ${field.id}`);
    });

  } catch (error) {
    console.error("❌ Error setting up metadata:", error);
    process.exit(1);
  }
}

// Run the setup
main().catch(console.error);