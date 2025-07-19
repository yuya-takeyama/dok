# AI Knowledge ETL Framework 要件定義書

## 1. プロジェクト概要

### 1.1 目的

AI時代における、ナレッジのETLパイプラインフレームワークを構築する。
Vector Storeのための「Embulk」として、様々なデータソースからナレッジベースへのデータ連携を効率化する。

### 1.2 解決する課題

- 複数のソースからVector Storeへのデータ連携が煩雑
- Vector Store移行時の再実装コスト
- N x N の組み合わせ爆発による開発・保守コストの増大
- 障害発生時の復旧の困難さ
- 手動でのデータ同期による作業ミスと非効率性

### 1.3 ビジネス価値

- **自動化**: 手動作業を削減し、定期的な同期を自動化
- **信頼性**: 障害時も再実行により正常状態に復旧
- **拡張性**: 新しいデータソースやナレッジベースへの対応が容易
- **透明性**: 実行前に変更内容を確認可能

## 2. 機能要件

### 2.1 コア機能

1. **データソース連携**
   - 様々なデータソースからドキュメントを取得
   - 認証情報の安全な管理
   - 差分同期による効率的な更新

2. **ナレッジベース連携**
   - 各種Vector Storeへのデータアップロード
   - ドキュメントの作成・更新・削除
   - メタデータの管理

3. **同期管理**
   - 新規・更新・削除が必要なドキュメントの自動検出
   - 複数のデータソースから複数のナレッジベースへの同期対応
   - 同期状態の追跡と管理

4. **設定管理**
   - YAMLベースの設定ファイル
   - 複数の同期ジョブの定義と管理
   - 環境変数による秘密情報の管理

### 2.2 Phase 1 対応範囲

- **Data Source**: Notion Database
- **Knowledge Base**: Dify Dataset
- **Document Format**: Markdown
- **同期パターン**: 1対1および多対多の同期をサポート

### 2.3 将来的な拡張性

- 複数のData Source対応
  - Google Drive
  - GitHub
  - S3
- 複数のKnowledge Base対応
  - AWS Bedrock Knowledge Base
  - Pinecone
  - Weaviate
- 追加のドキュメント形式サポート
  - HTML
  - PDF
  - Office文書

## 3. 非機能要件

### 3.1 性能要件

- 1000ドキュメントの同期を10分以内に完了
- 大規模データセット（10,000+ドキュメント）への対応
- メモリ効率的な処理（1GB以下のメモリ使用）

### 3.2 運用要件

- CLIツールとして実行可能
- 実行前の変更内容確認機能（ドライラン）
- 詳細なログ出力
- エラー時の適切なフィードバック
- 部分的な失敗時も可能な限り処理を継続

### 3.3 セキュリティ要件

- API認証情報の安全な管理
- 環境変数による秘密情報の分離
- 処理中のデータの適切な削除

## 4. インターフェース仕様

### 4.1 設定ファイル形式

```yaml
# シンプルな1対1の同期
syncJobs:
  notion-to-dify:
    sources:
      - provider: NotionProvider
        config:
          database_id: ${NOTION_DATABASE_ID}
    targets:
      - provider: DifyProvider
        config:
          dataset_id: ${DIFY_DATASET_ID}

# 複雑な多対多の同期（将来の拡張例）
providers:
  sources:
    notion-sales:
      provider: NotionProvider
      config:
        database_id: ${NOTION_SALES_DB_ID}
  targets:
    dify-main:
      provider: DifyProvider
      config:
        dataset_id: ${DIFY_DATASET_ID}

syncJobs:
  sales-sync:
    name: "営業部ナレッジ同期"
    sources: [notion-sales]
    targets: [dify-main]
```

### 4.2 環境変数

- `NOTION_API_KEY`: Notion APIキー
- `DIFY_API_KEY`: Dify APIキー
- `DIFY_API_BASE_URL`: Dify APIのベースURL

### 4.3 CLIインターフェース

```bash
# 基本実行（全ジョブを実行）
dok run --config config.yaml

# 特定のジョブのみ実行
dok run --config config.yaml --job notion-to-dify

# ドライラン（変更内容の確認のみ）
dok run --config config.yaml --dry-run

# デバッグモード
dok run --config config.yaml --log-level debug
```

## 5. 処理フロー

### 5.1 基本的な処理の流れ

1. 設定ファイルの読み込みとバリデーション
2. データソースとナレッジベースの現在の状態を取得
3. 必要な同期操作（作成・更新・削除）を計算
4. ドライランモードの場合は計画を表示して終了
5. 実行モードの場合は計画を実行
6. 結果のレポート出力

### 5.2 エラー処理

- APIエラー時の自動リトライ
- 部分的な失敗の記録と継続処理
- 詳細なエラーログの出力

## 6. 制約事項

### 6.1 技術的制約

- 初期実装はNode.js (TypeScript)
- パッケージマネージャー: pnpm
- コードフォーマッター:
  - TypeScript/JavaScript: Biome
  - Markdown/YAML/JSON: Prettier

### 6.2 Phase 1 の制約

- Embedding処理はナレッジベース側に委譲
- 同期ジョブの並列実行は未対応（順次実行のみ）
- スケジュール実行は外部ツール（GitHub Actions等）に依存

## 7. 成功指標

1. Notion DatabaseからDify Knowledgeへの自動同期が可能
2. 設定ファイルによる簡単なセットアップ
3. 障害からの自動復旧が可能
4. ドライランによる安全な事前確認
5. エラー時の適切なフィードバック
6. 多対多の同期パターンに対応可能
7. 新しいプロバイダーの追加が容易

## 8. ユーザーシナリオ

### 8.1 初回セットアップ

1. ユーザーが設定ファイルを作成
2. APIキーを環境変数に設定
3. `dok run --dry-run`で動作確認
4. `dok run`で初回同期を実行

### 8.2 定期実行

1. GitHub ActionsやCronで定期実行を設定
2. 自動的に差分同期が実行される
3. エラー時はログで通知

### 8.3 プロバイダー追加

1. 新しいデータソースやナレッジベースに対応
2. 設定ファイルを更新
3. 既存の同期ジョブに影響なく新しい同期を追加
