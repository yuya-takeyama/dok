#!/usr/bin/env tsx

import { Client } from "@notionhq/client";

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  last_edited_time: string;
}

interface NotionDatabaseResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

async function countNotionArticles() {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.error("❌ Missing required environment variables: NOTION_API_KEY, NOTION_DATABASE_ID");
    process.exit(1);
  }

  console.log("🔍 Counting Notion articles...\n");
  console.log(`📊 Database ID: ${databaseId}`);

  const client = new Client({
    auth: apiKey,
  });

  // First, get database info
  try {
    console.log("📚 Fetching database information...");
    const database = await client.databases.retrieve({
      database_id: databaseId,
    });
    console.log(`📋 Database title: ${(database as any).title?.[0]?.plain_text || 'Unknown'}`);
    console.log(`🔗 Database URL: ${(database as any).url || 'N/A'}`);
    console.log(`📅 Last edited: ${(database as any).last_edited_time || 'N/A'}`);
    console.log(""); 
  } catch (error) {
    console.warn("⚠️  Could not fetch database info:", error);
    console.log("");
  }

  let totalCount = 0;
  let hasMore = true;
  let startCursor: string | undefined;
  let pageNumber = 1;

  try {
    while (hasMore) {
      console.log(`📄 Fetching page ${pageNumber} with startCursor: ${startCursor || 'undefined'}`);

      const response: NotionDatabaseResponse = await client.databases.query({
        database_id: databaseId,
        start_cursor: startCursor,
        page_size: 100, // Maximum page size
        // No filters - get ALL pages including archived ones
        filter: undefined,
        sorts: undefined,
      });

      console.log(`📋 Page ${pageNumber} response:`);
      console.log(`  - Items in this page: ${response.results.length}`);
      console.log(`  - has_more: ${response.has_more}`);
      console.log(`  - next_cursor: ${response.next_cursor || 'null'}`);

      totalCount += response.results.length;
      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
      pageNumber++;

      console.log(`✅ Page ${pageNumber - 1} processed. Total count so far: ${totalCount}\n`);

      // Safety limit to prevent infinite loops
      if (pageNumber > 50) {
        console.warn("⚠️  Safety limit reached (50 pages). Stopping to prevent infinite loop.");
        break;
      }
    }

    console.log("🎉 Counting completed!");
    console.log(`📊 Final Results:`);
    console.log(`  - Total articles: ${totalCount}`);
    console.log(`  - Total pages fetched: ${pageNumber - 1}`);

  } catch (error) {
    console.error("❌ Error counting articles:", error);
    process.exit(1);
  }
}

// Run the script
countNotionArticles().catch(console.error);