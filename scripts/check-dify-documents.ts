#!/usr/bin/env tsx

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

async function fetchDifyDocuments() {
  const apiUrl = process.env.DIFY_API_URL;
  const apiKey = process.env.DIFY_API_KEY;
  const datasetId = process.env.DIFY_DATASET_ID;

  if (!apiUrl || !apiKey || !datasetId) {
    console.error("Missing required environment variables: DIFY_API_URL, DIFY_API_KEY, DIFY_DATASET_ID");
    process.exit(1);
  }

  console.log("🔍 Fetching Dify documents...\n");

  let page = 1;
  let hasMore = true;
  const allDocuments: DifyDocument[] = [];

  while (hasMore) {
    const url = new URL(`datasets/${datasetId}/documents`, apiUrl);
    url.searchParams.set("page", page.toString());
    url.searchParams.set("limit", "100");

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const data: DifyDocumentsResponse = await response.json();
      allDocuments.push(...data.data);
      hasMore = data.has_more;
      page++;
    } catch (error) {
      console.error("❌ Error fetching documents:", error);
      process.exit(1);
    }
  }

  console.log(`📚 Total documents: ${allDocuments.length}\n`);

  // 最新のドキュメントから表示
  const sortedDocuments = allDocuments.sort((a, b) => b.created_at - a.created_at);

  console.log("📄 Document List (newest first):");
  console.log("─".repeat(80));

  sortedDocuments.forEach((doc, index) => {
    const createdDate = new Date(doc.created_at * 1000).toLocaleString("ja-JP");
    const updatedDate = new Date(doc.updated_at * 1000).toLocaleString("ja-JP");
    
    console.log(`${index + 1}. ${doc.name}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   Created: ${createdDate}`);
    console.log(`   Updated: ${updatedDate}`);
    console.log("─".repeat(80));
  });

  // タイトルパターンの分析
  console.log("\n📊 Title Pattern Analysis:");
  const notionPattern = /^notion_[a-f0-9-]+_/;
  const notionDocs = sortedDocuments.filter(doc => notionPattern.test(doc.name));
  const cleanDocs = sortedDocuments.filter(doc => !notionPattern.test(doc.name));

  console.log(`- Documents with Notion ID prefix: ${notionDocs.length}`);
  console.log(`- Documents with clean titles: ${cleanDocs.length}`);

  if (cleanDocs.length > 0) {
    console.log("\n✨ Documents with clean titles:");
    cleanDocs.forEach(doc => {
      console.log(`  - ${doc.name}`);
    });
  }
}

// スクリプトを実行
fetchDifyDocuments().catch(console.error);