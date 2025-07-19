# AI Knowledge ETL Framework 設計書

## 1. 設計原則

### 1.1 冪等性 (Idempotency)

本フレームワークは、**冪等な実行**を最重要原則として設計されています。

- **障害からの自動復旧**: サーバーやネットワークの不具合で異常終了しても、再実行により望ましい状態に収束
- **Plan/Apply方式**: Terraformのように、まず実行計画(Plan)を生成し、それを適用(Apply)する2段階実行
- **オンメモリプランニング**: Planはファイルではなくメモリ上で管理し、高速に処理

### 1.2 純粋関数ベースの設計

- **副作用の分離**: ビジネスロジックは純粋関数として実装し、I/O操作から分離
- **テスタビリティ**: 純粋関数により単体テストが容易
- **予測可能性**: 同じ入力に対して常に同じ出力を保証

### 1.3 効率的なリソース管理

- **メタデータのみでの計画生成**: Plannerは文書本体に一切依存せず、メタデータ（ID、最終更新日時）のみで同期計画を生成
- **計画と実行の分離**: 同期計画の生成時には文書内容を扱わず、実行時にのみ必要な文書を処理
- **遅延ダウンロード**: 実際にcreate/updateが必要な文書のみ、実行時に取得・変換
- **プロバイダー固有の処理**: NotionのようにMarkdown変換が必要な場合も、Reconciler実行時にのみ処理
- **自動クリーンアップ**: 処理完了後、一時ファイルを自動削除

## 2. アーキテクチャ概要

### 2.1 全体構成

```mermaid
flowchart TB
    subgraph DS["Data Sources"]
        Notion["Notion<br/>ID: notion:page_id"]
        Future1["Future:<br/>Google Drive / GitHub"]
    end

    subgraph Core["Sync Engine"]
        Fetcher["Fetcher<br/>メタデータ取得"]
        Planner["Planner<br/>差分計算（純粋関数）"]
        Reconciler["Reconciler<br/>同期実行"]

        Fetcher -->|"metadata[]"| Planner
        Planner -->|"sync plan"| Reconciler
    end

    subgraph KB["Knowledge Bases"]
        Dify["Dify<br/>Dataset API"]
        Future2["Future:<br/>Other KBs"]
    end

    DS -->|"fetch metadata"| Fetcher
    KB -->|"fetch metadata"| Fetcher
    DS -->|"download content"| Reconciler
    Reconciler -->|"upload content"| KB

    %% シンプルなスタイル定義
    classDef default fill:#f9f9f9,stroke:#333,stroke-width:2px,color:#000
    classDef dataSource fill:#fff,stroke:#666,stroke-width:2px,color:#000
    classDef core fill:#fff,stroke:#666,stroke-width:2px,color:#000
    classDef knowledge fill:#fff,stroke:#666,stroke-width:2px,color:#000
```

### 2.2 コンポーネント設計

#### Core Components

1. **Config Manager**
   - YAML設定ファイルの読み込み
   - 環境変数の管理
   - バリデーション

2. **Fetcher Layer** (I/O層)
   - 全Data Sourceから現在のドキュメントのメタデータ一覧を取得（Desired State）
   - 各Knowledge Providerから個別にメタデータ一覧を取得（各々のCurrent State）
   - **文書本体は取得せず**、メタデータ（ID、最終更新日時）のみ取得

3. **Planner Layer** (純粋関数層)
   - Desired State（Sources）とCurrent State（Target）を突合
   - **メタデータのみで**実行計画（SyncPlan）を生成
   - 最終更新日時の比較により操作を決定: create, update, delete, skip
   - 純粋関数として実装され、副作用を持たない

4. **Reconciler Layer** (I/O層)
   - SyncPlanに基づいて実際の操作を実行
   - **単一のターゲットプロバイダーに対して操作を実行**（Single Responsibility Principle）
   - **create/update対象の文書のみ**、実行時に取得・処理
   - **プロバイダー固有の実装**: Notionはblocks→Markdown変換、Google Driveは直接ファイル取得など
   - エラーハンドリングとリトライ
   - 一時ファイルの自動クリーンアップ
   - 進捗状況の追跡

5. **Engine Layer** (実行制御層)
   - 全体の実行フロー制御
   - **各ターゲットに対して独立してReconcilerを実行**
   - 複数ターゲットへの同期は、Engineレベルでループ処理
   - ジョブ管理とドライランモード対応

6. **Provider実装**
   - NotionとDifyの直接実装
   - ID管理とメタデータ追跡

## 3. 同期戦略

### 3.1 ドキュメントの識別

- **一意識別子 (ID)**: Data SourceとKnowledge Provider間で同じドキュメントを識別
- **ID生成戦略**:
  - フォーマット: `<data-source-provider-id>:<original-id>`
  - 例:
    - Notion: `notion:<page_id>`
    - Google Drive: `google-drive:<file_id>`
    - GitHub: `github:<repository>/<file_path>`
- **Data Source Provider ID**: データソースを一意に識別する文字列（例: `notion`, `google-drive`, `github`）
- **設計思想**:
  - ドキュメントの一意性はデータソース内でのみ保証
  - 同一コンテンツが異なるデータソース間で移動した場合は、別のドキュメントとして扱う

### 3.2 同期ロジック

- **メタデータのみで効率的に計画生成**
- **文書本体は計画時点では取得しない**
- **最終更新日時の比較のみで更新要否を判断**

```typescript
// 純粋関数として実装される同期計画生成（メタデータのみ）
function createSyncPlan(
  sourceMetadata: DocumentMetadata[],
  knowledgeMetadata: DocumentMetadata[],
): SyncPlan {
  const operations: SyncOperation[] = [];

  // 1. Create: ソースにあってナレッジにない
  // 2. Update: 両方にあり、ソースの方が新しい（lastModified比較）
  // 3. Delete: ナレッジにあってソースにない
  // 4. Skip: 両方にあり、更新不要

  return { operations };
}
```

## 4. ディレクトリ構造

```
dok/
├── src/
│   ├── index.ts                 # エントリーポイント
│   ├── cli.ts                   # CLIインターフェース
│   ├── config/
│   │   ├── index.ts            # 設定管理
│   │   └── schema.ts           # 設定スキーマ定義
│   ├── core/
│   │   ├── engine.ts           # 実行エンジン（メイン実行フロー）
│   │   ├── fetcher.ts          # 状態取得ロジック
│   │   ├── createSyncPlan.ts   # 同期計画生成（純粋関数）
│   │   ├── reconciler.ts       # 計画実行ロジック
│   │   ├── types.ts            # 共通型定義
│   │   └── operations.ts       # 操作定義（create/update/delete/skip）
│   ├── providers/
│   │   ├── data_source/
│   │   │   └── notion.ts       # Notion Data Source Provider
│   │   └── knowledge/
│   │       └── dify.ts         # Dify Knowledge Provider
│   ├── utils/
│   │   ├── logger.ts           # ログユーティリティ
│   │   ├── error.ts            # エラーハンドリング
│   │   ├── retry.ts            # リトライロジック
│   │   └── tempfile.ts         # 一時ファイル管理
│   └── tests/
│       ├── createSyncPlan.test.ts # 同期計画生成のテスト
│       └── fixtures/           # テストデータ
├── config.yaml                 # 設定ファイル例
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── biome.json
└── .prettierrc
```

## 5. インターフェース設計

### 5.1 Core Types

```typescript
// Provider共通インターフェース
interface DataSourceProvider {
  providerId: string;
  initialize(config: Record<string, any>): Promise<void>;
  fetchDocumentsMetadata():
    | AsyncIterator<DocumentMetadata>
    | Promise<DocumentMetadata[]>;
  downloadDocumentContent(documentId: string): Promise<string>; // 一時ファイルパスを返す
}

interface KnowledgeProvider {
  initialize(config: Record<string, any>): Promise<void>;
  fetchDocumentsMetadata(): Promise<DocumentMetadata[]>;
  createDocumentFromFile(
    metadata: DocumentMetadata,
    filePath: string,
  ): Promise<void>;
  updateDocumentFromFile(
    metadata: DocumentMetadata,
    filePath: string,
  ): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
}

// DocumentMetadata型定義（これのみを使用、contentは扱わない）
interface DocumentMetadata {
  providerId: string; // Data Source Provider ID（例: 'notion', 'google-drive'）
  sourceId: string; // ソース側の元ID（プロバイダー固有のID）
  title: string;
  lastModified: Date; // 更新判定に使用（これが同期の要）
}

// ヘルパー関数
function getDocumentId(metadata: DocumentMetadata): string {
  return `${metadata.providerId}:${metadata.sourceId}`;
}

// 一時ファイル処理用の型
interface TempFileResult {
  metadata: DocumentMetadata;
  filePath: string; // 一時ファイルのパス
}

// 同期操作の定義
type SyncOperationType = "create" | "update" | "delete" | "skip";

interface SyncOperation {
  type: SyncOperationType;
  documentMetadata: DocumentMetadata; // 計画時点ではメタデータのみ
  reason: string; // 操作の理由（ログ用）
}

// 同期計画
interface SyncPlan {
  operations: SyncOperation[];
  summary: {
    total: number;
    create: number;
    update: number;
    delete: number;
    skip: number;
  };
}

// 実行結果
interface SyncResult {
  operation: SyncOperation;
  success: boolean;
  error?: Error;
  duration: number; // 実行時間（ms）
}
```

### 5.2 Configuration Schema

```typescript
// 新しい設定構造：多対多の同期パターンに対応
interface Config {
  // プロバイダーの事前定義（DRY原則）
  providers?: {
    sources?: Record<string, SourceConfig>;
    targets?: Record<string, TargetConfig>;
  };

  // 同期ジョブの定義（Job IDをキーとするマップ）
  jobs: Record<string, JobConfig>;

  // グローバルオプション
  options?: {
    logLevel?: "debug" | "info" | "warn" | "error";
  };
}

interface JobConfig {
  name?: string; // ジョブの説明（省略時はJob IDを使用）
  sources: string[] | SourceConfig[]; // プロバイダーIDの参照、またはインライン定義
  targets: string[] | TargetConfig[]; // プロバイダーIDの参照、またはインライン定義
  options?: {
    enabled?: boolean; // ジョブの有効/無効
    schedule?: string; // cron形式（将来の拡張用）
  };
}

interface SourceConfig {
  id?: string; // 参照用のID（providers定義時のみ）
  provider: string; // プロバイダー実装クラス名（例: 'NotionProvider'）
  providerId: string; // Data Source Provider ID（例: 'notion', 'google-drive'）
  config: Record<string, any>; // プロバイダー固有の設定
}

interface TargetConfig {
  id?: string; // 参照用のID（providers定義時のみ）
  provider: string; // プロバイダー実装クラス名（例: 'DifyProvider'）
  config: Record<string, any>; // プロバイダー固有の設定
}
```

## 6. 実装詳細

### 6.1 Notion Provider

```typescript
export class NotionProvider implements DataSourceProvider {
  providerId = "notion";
  private client: Client;
  private databaseId: string;

  async initialize(config: NotionConfig): Promise<void> {
    this.client = new Client({ auth: process.env.NOTION_API_KEY });
    this.databaseId = config.database_id;
  }

  async *fetchDocumentsMetadata(): AsyncIterator<DocumentMetadata> {
    // ページネーション対応でデータベースからメタデータのみ取得
    const pages = await this.client.databases.query({
      database_id: this.databaseId,
    });

    for (const page of pages.results) {
      yield {
        id: `notion:${page.id}`, // 標準化されたID形式
        sourceId: page.id, // Notion固有のページID
        providerId: "notion", // Data Source Provider ID
        title: this.extractTitle(page),
        lastModified: new Date(page.last_edited_time),
      };
    }
  }

  async downloadDocumentContent(pageId: string): Promise<string> {
    // ページ本体を取得してMarkdownに変換（この処理はメモリ上で実行）
    const page = await this.client.pages.retrieve({ page_id: pageId });
    const markdown = await this.pageToMarkdown(page);

    // 変換結果を一時ファイルに保存
    const tempPath = path.join(
      os.tmpdir(),
      `notion_${pageId}_${Date.now()}.md`,
    );
    await fs.writeFile(tempPath, markdown);

    return tempPath; // ファイルパスを返す
  }
}
```

### 6.2 Dify Provider

```typescript
export class DifyProvider implements KnowledgeProvider {
  private apiKey: string;
  private baseUrl: string;
  private datasetId: string;

  async initialize(config: DifyConfig): Promise<void> {
    this.apiKey = process.env.DIFY_API_KEY!;
    this.baseUrl = process.env.DIFY_API_BASE_URL!;
    this.datasetId = config.dataset_id;
  }

  async fetchDocumentsMetadata(): Promise<DocumentMetadata[]> {
    // Dify APIから既存ドキュメントのメタデータ一覧を取得
    const response = await axios.get(
      `${this.baseUrl}/datasets/${this.datasetId}/documents`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    return response.data.map((doc: any) => ({
      id: doc.name, // Data Source側のID（format: <provider-id>:<original-id>）
      sourceId: doc.id, // Dify内部のドキュメントID
      providerId: this.extractProviderId(doc.name), // IDから抽出
      title: doc.title,
      lastModified: new Date(doc.updated_at),
    }));
  }

  private extractProviderId(id: string): string {
    // ID形式: <provider-id>:<original-id> からprovider-idを抽出
    const [providerId] = id.split(":", 2);
    return providerId;
  }

  async createDocumentFromFile(
    metadata: DocumentMetadata,
    filePath: string,
  ): Promise<void> {
    // ファイルから直接アップロード（メモリに載せない）
    const formData = new FormData();
    formData.append("name", metadata.id);
    formData.append("title", metadata.title);
    formData.append("metadata", JSON.stringify(metadata));

    // 一時ファイルからアップロード（大きなファイルでもメモリ効率的）
    const fileStream = fs.createReadStream(filePath);
    formData.append("file", fileStream);

    await axios.post(
      `${this.baseUrl}/datasets/${this.datasetId}/documents`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...formData.getHeaders(),
        },
      },
    );
  }

  async updateDocumentFromFile(
    metadata: DocumentMetadata,
    filePath: string,
  ): Promise<void> {
    // 既存ドキュメント更新（ファイルから）
    const formData = new FormData();
    formData.append("title", metadata.title);
    formData.append("metadata", JSON.stringify(metadata));

    const fileStream = fs.createReadStream(filePath);
    formData.append("file", fileStream);

    await axios.put(
      `${this.baseUrl}/datasets/${this.datasetId}/documents/${metadata.sourceId}`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...formData.getHeaders(),
        },
      },
    );
  }

  async deleteDocument(documentId: string): Promise<void> {
    // ドキュメント削除
    await axios.delete(
      `${this.baseUrl}/datasets/${this.datasetId}/documents/${documentId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
  }
}
```

### 6.3 Planner (純粋関数層)

```typescript
// 純粋関数として実装される同期計画生成（メタデータのみ使用）
export function createSyncPlan(
  sourceMetadata: DocumentMetadata[],
  knowledgeMetadata: DocumentMetadata[],
): SyncPlan {
  const sourceMap = new Map(sourceMetadata.map((d) => [d.id, d]));
  const knowledgeMap = new Map(knowledgeMetadata.map((d) => [d.id, d]));
  const operations: SyncOperation[] = [];

  // Create/Update operations
  for (const [id, sourceDoc] of sourceMap) {
    const knowledgeDoc = knowledgeMap.get(id);

    if (!knowledgeDoc) {
      operations.push({
        type: "create",
        documentMetadata: sourceDoc,
        reason: "Document exists in source but not in knowledge",
      });
    } else if (sourceDoc.lastModified > knowledgeDoc.lastModified) {
      operations.push({
        type: "update",
        documentMetadata: sourceDoc,
        reason: `Source document is newer (${sourceDoc.lastModified} > ${knowledgeDoc.lastModified})`,
      });
    } else {
      operations.push({
        type: "skip",
        documentMetadata: sourceDoc,
        reason: "Document is up to date",
      });
    }
  }

  // Delete operations
  for (const [id, knowledgeDoc] of knowledgeMap) {
    if (!sourceMap.has(id)) {
      operations.push({
        type: "delete",
        documentMetadata: knowledgeDoc,
        reason: "Document no longer exists in source",
      });
    }
  }

  // Summary calculation
  const summary = operations.reduce(
    (acc, op) => {
      acc.total++;
      acc[op.type]++;
      return acc;
    },
    { total: 0, create: 0, update: 0, delete: 0, skip: 0 },
  );

  return { operations, summary };
}
```

### 6.4 Engine

```typescript
export class Engine {
  private fetcher: Fetcher;
  private sourceProviderMap: Map<string, DataSourceProvider>;
  private readonly logger: Logger;
  private readonly jobName?: string;

  constructor(
    sourceProviders: DataSourceProvider[],
    private readonly targetProviders: KnowledgeProvider[],
    private readonly options: EngineOptions = {},
  ) {
    this.logger = options.logger ?? new NullLogger();
    this.jobName = options.jobName;
    this.fetcher = new Fetcher(sourceProviders);

    // Create a map of source providers for reconciler
    this.sourceProviderMap = new Map<string, DataSourceProvider>();
    for (const provider of sourceProviders) {
      this.sourceProviderMap.set(provider.providerId, provider);
    }
  }

  async run(): Promise<void> {
    this.logger.info("Starting sync job", { jobName: this.jobName });

    // Step 1: Fetch metadata from sources (desired state)
    this.logger.info("Fetching metadata from sources");
    const sourceMetadata = await this.fetcher.fetchSourceMetadata();

    this.logger.info("Source metadata fetched", {
      sourceCount: sourceMetadata.length,
    });

    // Step 2: Process each target individually
    for (const targetProvider of this.targetProviders) {
      this.logger.info("Processing target provider");

      // Fetch current state for this target
      const targetMetadata =
        await this.fetcher.fetchTargetMetadata(targetProvider);

      this.logger.info("Target metadata fetched", {
        targetCount: targetMetadata.length,
      });

      // Generate sync plan for this target
      this.logger.info("Generating sync plan for target");
      const plan = createSyncPlan(sourceMetadata, targetMetadata);

      this.logger.info("Sync plan generated for target", {
        summary: plan.summary,
      });

      // Execute sync plan for this target
      const reconciler = new Reconciler(
        this.sourceProviderMap,
        targetProvider,
        {
          logger: this.logger,
          dryRun: this.options?.dryRun,
        },
      );
      await reconciler.execute(plan);
    }

    this.logger.info("Sync job completed", { jobName: this.jobName });
  }
}
```

## 7. エラーハンドリング

- **基本方針**: Plan/Applyベースの冪等な実行により、エラーからの復旧を保証
- **詳細な実装**: 必要に応じて後から追加

## 8. 依存パッケージ

### Production Dependencies

- `@notionhq/client`: Notion API Client
- `axios`: HTTP Client for Dify API
- `form-data`: Multipart form data for file uploads
- `yaml`: YAML Parser
- `zod`: Schema Validation
- `winston`: Logging

### Development Dependencies

- `typescript`: 言語
- `@types/node`: Node.js型定義
- `tsx`: TypeScript実行
- `@biomejs/biome`: コードフォーマッター（TS/JS）
- `prettier`: コードフォーマッター（MD/YAML/JSON）
- `vitest`: テストフレームワーク

## 9. CLIインターフェース

```bash
# 基本実行（全ジョブを実行）
dok run --config config.yaml

# 特定のジョブのみ実行
dok run --config config.yaml --job <job-id>

# 複数ジョブを実行
dok run --config config.yaml --job <job-id1>,<job-id2>

# ドライラン
dok run --config config.yaml --dry-run

# 特定ジョブのドライラン
dok run --config config.yaml --job <job-id> --dry-run

# デバッグモード
dok run --config config.yaml --log-level debug

# ヘルプ
dok --help
```

### 9.1 設定ファイル例

#### シンプルな例（1対1の同期）

```yaml
# config-simple.yaml
jobs:
  notion-to-dify:
    sources:
      - provider: NotionProvider
        providerId: notion
        config:
          database_id: ${NOTION_DATABASE_ID}
    targets:
      - provider: DifyProvider
        config:
          dataset_id: ${DIFY_DATASET_ID}

options:
  logLevel: info
```

#### 複雑な例（部署別ナレッジ管理）

```yaml
# config-enterprise.yaml
# プロバイダーの事前定義
providers:
  sources:
    notion-sales:
      provider: NotionProvider
      providerId: notion
      config:
        database_id: ${NOTION_SALES_DB_ID}
        filters:
          status: published

    notion-dev:
      provider: NotionProvider
      providerId: notion
      config:
        database_id: ${NOTION_DEV_DB_ID}

    gdrive-sales:
      provider: GoogleDriveProvider
      providerId: google-drive
      config:
        folder_id: ${GDRIVE_SALES_FOLDER_ID}

  targets:
    dify-sales:
      provider: DifyProvider
      config:
        dataset_id: ${DIFY_SALES_DATASET_ID}
        batch_size: 10

    dify-dev:
      provider: DifyProvider
      config:
        dataset_id: ${DIFY_DEV_DATASET_ID}

    dify-company:
      provider: DifyProvider
      config:
        dataset_id: ${DIFY_COMPANY_DATASET_ID}

    pinecone-test:
      provider: PineconeProvider
      config:
        index_name: ${PINECONE_INDEX_NAME}

# 同期ジョブの定義
jobs:
  # 営業部: 複数ソース → 複数ターゲット
  sales-knowledge-sync:
    name: "営業部ナレッジ同期"
    sources: [notion-sales, gdrive-sales]
    targets: [dify-sales, dify-company]

  # 開発部: 単一ソース → 複数ターゲット
  dev-knowledge-sync:
    name: "開発部ナレッジ同期"
    sources: [notion-dev]
    targets: [dify-dev, dify-company]

  # 移行テスト: 同じソースを複数のターゲットへ
  migration-test:
    name: "Dify→Pinecone移行テスト"
    sources: [notion-sales]
    targets: [dify-sales, pinecone-test]
    options:
      enabled: false # テスト時のみ有効化

options:
  logLevel: info
```

### 9.2 実行モード

#### コマンドライン実行

```bash
# すべてのジョブを実行
dok run --config config.yaml

# 特定のジョブのみ実行
dok run --config config.yaml --job sales-knowledge-sync

# 複数のジョブを実行
dok run --config config.yaml --job sales-knowledge-sync,dev-knowledge-sync

# ドライランで特定のジョブを確認
dok run --config config.yaml --job migration-test --dry-run
```

#### GitHub Actions実行

```yaml
# .github/workflows/sync-knowledge.yml
name: Sync Knowledge Base
on:
  schedule:
    - cron: "0 */6 * * *" # 6時間ごと
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx dok run --config config/production.yaml
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          DIFY_API_KEY: ${{ secrets.DIFY_API_KEY }}
```

- **環境変数**: APIキーなどの機密情報は環境変数で管理

## 10. テスト戦略

### 10.1 純粋関数のユニットテスト

```typescript
// createSyncPlan.test.ts
import { describe, it, expect } from "vitest";
import { createSyncPlan } from "../core/createSyncPlan";

describe("generateSyncPlan", () => {
  it("should create new documents", () => {
    const sourceMetadata: DocumentMetadata[] = [
      {
        id: "doc1",
        sourceId: "page1",
        title: "Test Document",
        lastModified: new Date("2024-01-01"),
        metadata: { sourceType: "notion" },
      },
    ];
    const knowledgeMetadata: DocumentMetadata[] = [];

    const plan = createSyncPlan(sourceMetadata, knowledgeMetadata);

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].type).toBe("create");
  });

  it("should update outdated documents", () => {
    // テストケース実装
  });

  it("should delete removed documents", () => {
    // テストケース実装
  });
});
```

## 11. 将来の拡張ポイント

1. **新しいData Source Provider**
   - Google Drive
   - GitHub
   - S3

2. **新しいKnowledge Provider**
   - AWS Bedrock Knowledge Base
   - Pinecone
   - Weaviate

3. **変換機能**
   - HTML/PDF → Markdown変換
   - メタデータエンリッチメント
