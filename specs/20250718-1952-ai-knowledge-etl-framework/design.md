# AI Knowledge ETL Framework 設計書

## 1. アーキテクチャ概要

### 1.1 全体構成

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Data Sources   │     │   ETL Engine    │     │   Knowledge     │
│                 │     │                 │     │   Providers     │
│  - Notion       │────▶│  - Extractor    │────▶│  - Dify         │
│  - (Future:     │     │  - (Transform)  │     │  - (Future:     │
│    Google Drive,│     │  - Loader       │     │    Bedrock,     │
│    GitHub, S3)  │     │                 │     │    S3 Vector)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 1.2 コンポーネント設計

#### Core Components

1. **Config Manager**
   - YAML設定ファイルの読み込み
   - 環境変数の管理
   - バリデーション

2. **Provider実装**
   - NotionとDifyの直接実装
   - モノリシックな単一パッケージ

3. **ETL Engine**
   - パイプライン実行エンジン
   - エラーハンドリング
   - ログ管理

## 2. ディレクトリ構造

```
dok/
├── src/
│   ├── index.ts                 # エントリーポイント
│   ├── cli.ts                   # CLIインターフェース
│   ├── config/
│   │   ├── index.ts            # 設定管理
│   │   └── schema.ts           # 設定スキーマ定義
│   ├── core/
│   │   ├── engine.ts           # ETLエンジン
│   │   ├── pipeline.ts         # パイプライン実行
│   │   └── types.ts            # 共通型定義
│   ├── providers/
│   │   ├── data_source/
│   │   │   └── notion.ts       # Notion Data Source Provider
│   │   └── knowledge/
│   │       └── dify.ts         # Dify Knowledge Provider
│   └── utils/
│       ├── logger.ts           # ログユーティリティ
│       └── error.ts            # エラーハンドリング
├── config.yaml                 # 設定ファイル例
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── biome.json
└── .prettierrc
```

## 3. インターフェース設計

### 3.1 Provider Interface

```typescript
// Document型定義
interface Document {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  lastModified: Date;
}

// Phase 1では直接実装するため、インターフェースは内部実装の型定義として使用
```

### 3.2 Configuration Schema

```typescript
interface Config {
  sources: SourceConfig[];
  knowledges: KnowledgeConfig[];
  options?: {
    dryRun?: boolean;
    logLevel?: "debug" | "info" | "warn" | "error";
  };
}

interface SourceConfig {
  provider: string;
  config: Record<string, any>;
}

interface KnowledgeConfig {
  provider: string;
  config: Record<string, any>;
}
```

## 4. 実装詳細

### 4.1 Notion Provider

```typescript
export class NotionProvider {
  private client: Client;
  private databaseId: string;

  async initialize(config: NotionConfig): Promise<void> {
    this.client = new Client({ auth: process.env.NOTION_API_KEY });
    this.databaseId = config.database_id;
  }

  async *fetchDocuments(): AsyncIterator<Document> {
    // ページネーション対応でデータベースからページを取得
    // 各ページをMarkdownに変換してDocumentとして返す
  }
}
```

### 4.2 Dify Provider

```typescript
export class DifyProvider {
  private apiKey: string;
  private baseUrl: string;
  private datasetId: string;

  async initialize(config: DifyConfig): Promise<void> {
    this.apiKey = process.env.DIFY_API_KEY!;
    this.baseUrl = process.env.DIFY_API_BASE_URL!;
    this.datasetId = config.dataset_id;
  }

  async upsertDocument(document: Document): Promise<void> {
    // Dify APIを使用してドキュメントをアップロード
    // 既存ドキュメントの場合は更新
  }
}
```

### 4.3 ETL Engine

```typescript
class ETLEngine {
  async execute(config: Config): Promise<void> {
    // 1. Providerの初期化
    // 2. ソースからドキュメントを取得
    // 3. 各ドキュメントをKnowledgeにアップロード
    // 4. エラーハンドリングとリトライ
    // 5. 結果レポート
  }
}
```

## 5. エラーハンドリング

### 5.1 エラー戦略

- **Transient Errors**: 自動リトライ（最大3回）
- **Permanent Errors**: ログ記録して継続
- **Fatal Errors**: 処理中断

### 5.2 ログ設計

- 構造化ログ（JSON形式）
- ログレベル: debug, info, warn, error
- 進捗状況の定期的な出力

## 6. 依存パッケージ

### Production Dependencies

- `@notionhq/client`: Notion API Client
- `axios`: HTTP Client for Dify API
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

## 7. CLIインターフェース

```bash
# 基本実行
dok run --config config.yaml

# ドライラン
dok run --config config.yaml --dry-run

# デバッグモード
dok run --config config.yaml --log-level debug

# ヘルプ
dok --help
```

## 8. 将来の拡張ポイント

1. **Transform Layer**
   - ドキュメント変換機能
   - メタデータエンリッチメント

2. **Parallel Processing**
   - 並列実行によるパフォーマンス向上
   - Worker Pool実装

3. **Incremental Sync**
   - 差分同期の実装
   - 状態管理（最終同期時刻など）

4. **Monitoring**
   - メトリクス収集
   - 外部監視システムとの連携
