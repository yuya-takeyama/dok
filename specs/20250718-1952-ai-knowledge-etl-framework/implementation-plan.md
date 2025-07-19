# AI Knowledge ETL Framework 実装計画書

## Phase 1: 基本フレームワーク実装

### 実装方針

- 新しいアーキテクチャ（Fetcher/Planner/Reconciler）に基づいた実装
- 冪等性を保証するPlan/Apply方式
- メタデータのみでの高速な同期計画生成
- 多対多の同期パターンに対応した設計（Phase 1では1対1のみ実装）

## 実装ステップ

### Step 1: プロジェクトセットアップ（30分）

1. **プロジェクト初期化**
   - `pnpm init`
   - TypeScript設定
   - Biome/Prettier設定
   - 基本的なディレクトリ構造作成

2. **依存関係インストール**

   ```bash
   # Production
   pnpm add @notionhq/client axios form-data yaml zod winston

   # Development
   pnpm add -D typescript @types/node tsx @biomejs/biome prettier vitest
   ```

3. **設定ファイル作成**
   - `tsconfig.json`
   - `biome.json`
   - `.prettierrc`
   - `.gitignore`

### Step 2: Core Types とインターフェース定義（45分）

1. **基本型定義** (`src/core/types.ts`)

   ```typescript
   interface DocumentMetadata {
     id: string; // format: <provider-id>:<original-id>
     sourceId: string;
     providerId: string;
     title: string;
     lastModified: Date;
   }

   interface SyncOperation {
     type: "create" | "update" | "delete" | "skip";
     documentMetadata: DocumentMetadata;
     reason: string;
   }

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
   ```

2. **Provider インターフェース** (`src/core/types.ts`)

   ```typescript
   interface DataSourceProvider {
     providerId: string;
     initialize(config: Record<string, any>): Promise<void>;
     fetchDocumentsMetadata():
       | AsyncIterator<DocumentMetadata>
       | Promise<DocumentMetadata[]>;
     downloadDocumentContent(documentId: string): Promise<string>;
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
   ```

3. **設定型定義** (`src/config/schema.ts`)
   - Zodによる設定スキーマ定義
   - 新しいsyncJobsベースの設定構造

### Step 3: Core Engine 実装（60分）

1. **Fetcher Layer** (`src/core/fetcher.ts`)
   - メタデータ取得の抽象化
   - Provider間の差異を吸収

2. **Planner Layer** (`src/core/planner.ts`)
   - 純粋関数として実装
   - メタデータのみで同期計画を生成
   - create/update/delete/skip の判定ロジック

3. **Reconciler Layer** (`src/core/reconciler.ts`)
   - SyncPlanに基づく実行
   - 必要な文書のみダウンロード
   - 一時ファイル管理
   - エラーハンドリングとクリーンアップ

4. **ETL Engine** (`src/core/engine.ts`)
   - 全体の実行フロー制御
   - ジョブ管理
   - ドライランモード対応

### Step 4: Notion Provider 実装（60分）

1. **Notionクライアント初期化** (`src/providers/data_source/notion.ts`)
   - API認証
   - データベースID設定

2. **メタデータ取得**
   - AsyncIteratorによるページネーション対応
   - ID形式: `notion:<page_id>`
   - 最終更新日時の取得

3. **コンテンツダウンロード**
   - 実行時のみ呼ばれる
   - Notionブロック→Markdown変換
   - 一時ファイルへの保存

### Step 5: Dify Provider 実装（45分）

1. **Difyクライアント初期化** (`src/providers/knowledge/dify.ts`)
   - API認証
   - データセットID設定

2. **メタデータ取得**
   - 既存ドキュメント一覧の取得
   - IDフォーマットの解析

3. **ドキュメント操作**
   - createDocumentFromFile: ファイルからの新規作成
   - updateDocumentFromFile: ファイルからの更新
   - deleteDocument: 削除

### Step 6: CLI実装（30分）

1. **CLIパーサー** (`src/cli.ts`)

   ```bash
   dok run --config config.yaml
   dok run --config config.yaml --job notion-to-dify
   dok run --config config.yaml --dry-run
   dok run --config config.yaml --log-level debug
   ```

2. **エントリーポイント** (`src/index.ts`)
   - コマンド実行
   - エラーハンドリング

### Step 7: 設定管理とロガー（30分）

1. **設定管理** (`src/config/index.ts`)
   - YAML読み込み
   - 環境変数展開
   - バリデーション

2. **ロガー** (`src/utils/logger.ts`)
   - Winston設定
   - ログレベル管理
   - 進捗表示

### Step 8: テストと動作確認（45分）

1. **ユニットテスト作成**
   - Planner（純粋関数）のテスト
   - 各種エッジケースの確認

2. **設定ファイル作成**

   ```yaml
   syncJobs:
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
   ```

3. **統合テスト**
   - 実際のNotion→Dify同期
   - ドライランモードの確認
   - エラーケースの確認

## 実装の優先順位

### Phase 1.0（必須）

- [x] Core Types定義
- [x] Fetcher/Planner/Reconciler の基本実装
- [ ] Notion Provider（メタデータ取得・コンテンツダウンロード）
- [ ] Dify Provider（CRUD操作）
- [ ] 基本的なCLI
- [ ] ドライランモード

### Phase 1.1（次フェーズ）

- [ ] より詳細なエラーハンドリング
- [ ] リトライ機構
- [ ] 進捗バー表示
- [ ] 部分的な同期（フィルター機能）
- [ ] 複数ジョブの並列実行

## 技術的な決定事項

### アーキテクチャ

- **3層構造**: Fetcher（I/O）→ Planner（純粋関数）→ Reconciler（I/O）
- **冪等性の保証**: 同じ状態に対して同じPlanを生成
- **メモリ効率**: 一時ファイルによる大容量ドキュメント対応

### 同期戦略

- **ID管理**: `<provider-id>:<original-id>` 形式
- **更新判定**: lastModified の比較のみ
- **削除処理**: ソースに存在しないドキュメントを削除

### エラーハンドリング

- **Notion API エラー**: 基本的なリトライ（Phase 1.1で詳細実装）
- **変換エラー**: ログ出力して継続
- **ファイルI/Oエラー**: 即座に中断

## 見積もり時間

- 総実装時間: 約5.5時間
- Step 1-2: 1.25時間（基礎構築）
- Step 3: 1時間（Core Engine）
- Step 4-5: 1.75時間（Provider実装）
- Step 6-8: 1.5時間（CLI・テスト）

## 実装済み機能（2025-01-19）

### Core Engine実装

- ✅ Zodによる型安全なスキーマ定義
- ✅ Fetcher Layer: メタデータ取得の抽象化（AsyncIterator対応）
- ✅ Planner Layer: 純粋関数による同期計画生成
- ✅ Reconciler Layer: SyncPlanに基づく実行とクリーンアップ
- ✅ ETL Engine: 全体のフロー制御

### テスト

- ✅ Plannerの包括的なユニットテスト（100%カバレッジ）
  - create/update/delete/skipの全ケース
  - 混合ケースのテスト
  - エッジケースの考慮

### 次のステップ

1. **Notion Provider実装**
   - Notionクライアント初期化
   - AsyncIteratorによるページネーション対応
   - Notionブロック→Markdown変換
2. **Dify Provider実装**
   - APIクライアント初期化
   - CRUD操作の実装
   - ファイルアップロード処理

3. **CLI/設定管理**
   - CLIパーサー実装
   - YAML設定ファイル読み込み
   - 環境変数展開
   - 構造化ロガー（Winston）設定

## 成功基準

1. メタデータのみで高速に同期計画を生成できる
2. ドライランで事前に実行内容を確認できる
3. Notion→Difyの同期が冪等に実行される
4. エラー時も再実行で正常状態に復旧する
5. 将来の拡張（多対多同期）が容易な設計になっている
