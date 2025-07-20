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

async function getMetadataFieldIds(): Promise<Map<string, string>> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  const response = await fetchApi(`datasets/${datasetId}/metadata`, {
    method: "GET",
  });

  const data = await response.json();
  const fields: MetadataField[] = data.doc_metadata || data.data || [];

  const fieldIds = new Map<string, string>();
  for (const field of fields) {
    fieldIds.set(field.name, field.id);
  }

  return fieldIds;
}

async function setTestMetadata(documentId: string): Promise<void> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  const fieldIds = await getMetadataFieldIds();
  console.log("📋 Available metadata fields:", Array.from(fieldIds.keys()));

  // 特徴的な値を設定
  const timestamp = new Date().toISOString();
  const testId = `TEST_${Date.now()}`;

  const metadataList: Array<{ id: string; name: string; value: string }> = [];

  // source_id に特徴的な値を設定
  const sourceIdFieldId = fieldIds.get("source_id");
  if (sourceIdFieldId) {
    metadataList.push({
      id: sourceIdFieldId,
      name: "source_id",
      value: testId, // 特徴的な値
    });
  }

  // provider_id に特徴的な値を設定
  const providerIdFieldId = fieldIds.get("provider_id");
  if (providerIdFieldId) {
    metadataList.push({
      id: providerIdFieldId,
      name: "provider_id",
      value: "TEST_PROVIDER", // 特徴的な値
    });
  }

  // last_updated に現在時刻を設定
  const lastUpdatedFieldId = fieldIds.get("last_updated");
  if (lastUpdatedFieldId) {
    metadataList.push({
      id: lastUpdatedFieldId,
      name: "last_updated",
      value: timestamp, // 現在時刻
    });
  }

  if (metadataList.length === 0) {
    console.warn("⚠️ No metadata fields found to update");
    return;
  }

  console.log("📝 Setting metadata for document:", documentId);
  console.log("📝 Metadata values:", metadataList);

  try {
    await fetchApi(`datasets/${datasetId}/documents/metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation_data: [
          {
            document_id: documentId,
            metadata_list: metadataList,
          },
        ],
      }),
    });

    console.log("✅ Successfully set test metadata for document:", documentId);
    console.log("🔍 Test values set:");
    console.log(`   source_id: ${testId}`);
    console.log(`   provider_id: TEST_PROVIDER`);
    console.log(`   last_updated: ${timestamp}`);
  } catch (error) {
    console.error("❌ Failed to set test metadata:", error);
    throw error;
  }
}

async function getLatestDocument(): Promise<string | null> {
  const datasetId = process.env.DIFY_DATASET_ID;
  if (!datasetId) {
    throw new Error("Missing DIFY_DATASET_ID");
  }

  console.log("🔍 Fetching latest document...");

  const response = await fetchApi(`datasets/${datasetId}/documents?page=1&limit=1`, {
    method: "GET",
  });

  const data: DifyDocumentsResponse = await response.json();

  if (data.data.length === 0) {
    console.log("📄 No documents found");
    return null;
  }

  const latestDoc = data.data[0];
  console.log(`📄 Latest document: ${latestDoc.name} (ID: ${latestDoc.id})`);
  return latestDoc.id;
}

async function main() {
  try {
    console.log("🚀 Starting metadata registration test...\n");

    // 最新のドキュメントを取得
    const documentId = await getLatestDocument();
    if (!documentId) {
      console.log("❌ No documents found to test with");
      return;
    }

    // テスト用メタデータを設定
    await setTestMetadata(documentId);

    console.log("\n✅ Test metadata registration completed!");
    console.log("🔍 Now you can run the metadata retrieval test to check if these values can be retrieved via API");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// スクリプトを実行
main().catch(console.error);