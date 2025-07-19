# AI Knowledge ETL Framework 実装計画書

## Phase 1: Notionデータ取得の実装

### 実装方針

- まずはNotionからのデータ取得機能に集中
- 同期管理はオンメモリで実装
- ファイルは一時ディレクトリ（tempdir）に保存
- Dify連携は後回し

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
   pnpm add @notionhq/client yaml zod winston

   # Development
   pnpm add -D typescript @types/node tsx @biomejs/biome prettier
   ```

3. **設定ファイル作成**
   - `tsconfig.json`
   - `biome.json`
   - `.prettierrc`
   - `.gitignore`

### Step 2: 基本構造の実装（45分）

1. **型定義** (`src/core/types.ts`)
   - Document型
   - Config型
   - NotionConfig型

2. **設定管理** (`src/config/`)
   - YAML読み込み
   - Zodによるバリデーション
   - 環境変数の管理

3. **ログ機能** (`src/utils/logger.ts`)
   - Winston設定
   - ログレベル管理

### Step 3: Notion Provider実装（90分）

1. **Notionクライアント初期化** (`src/providers/data_source/notion.ts`)
   - API認証
   - データベースID設定

2. **ページ取得機能**
   - データベースからページ一覧取得
   - ページネーション対応
   - エラーハンドリング

3. **Markdown変換**
   - Notionブロックの解析
   - Markdownフォーマットへの変換
   - メタデータの抽出

4. **一時ファイル管理**
   - tempdir作成
   - Markdownファイルの保存
   - ファイルパスの管理

### Step 4: CLIインターフェース（30分）

1. **基本コマンド実装** (`src/cli.ts`)
   - `dok fetch` - Notionからデータ取得
   - `--config` オプション
   - `--dry-run` オプション

2. **エントリーポイント** (`src/index.ts`)
   - CLIパーサー
   - コマンド実行

### Step 5: テストと動作確認（30分）

1. **サンプル設定ファイル作成**

   ```yaml
   sources:
     - provider: notion
       config:
         database_id: YOUR_DATABASE_ID
   ```

2. **実行テスト**
   - Notionデータベースからのデータ取得
   - Markdown変換の確認
   - 一時ファイルの生成確認

## 実装の優先順位

### 必須機能（Phase 1.0）

- [x] Notion APIからのデータ取得
- [x] Markdownへの変換
- [x] 一時ファイルへの保存
- [x] 基本的なCLI

### 次フェーズ（Phase 1.1）

- [ ] Dify連携
- [ ] 同期状態の管理
- [ ] 差分更新
- [ ] より詳細なエラーハンドリング

## 技術的な決定事項

### データ同期戦略

- **Phase 1**: 全件取得・全件処理
- **将来**: 最終更新日時による差分同期

### ファイル管理

- Node.jsの`os.tmpdir()`を使用
- 実行ごとに新しいディレクトリを作成
- 処理完了後のクリーンアップ

### エラーハンドリング

- Notion API エラー: リトライ（3回まで）
- 変換エラー: ログ出力して継続
- ファイルI/Oエラー: 即座に中断

## 見積もり時間

- 総実装時間: 約4時間
- Step 1-2: 1.25時間（基礎構築）
- Step 3: 1.5時間（Notion実装）
- Step 4-5: 1時間（CLI・テスト）

## 成功基準

1. Notionデータベースからページを取得できる
2. 取得したページがMarkdownファイルとして保存される
3. CLIから簡単に実行できる
4. エラー時に適切なメッセージが表示される
