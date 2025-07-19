# AI Knowledge ETL Framework 要件定義書

## 1. プロジェクト概要

### 1.1 目的
AI時代における、ナレッジのETLパイプラインフレームワークを構築する。
Vector Storeのための「Embulk」として、様々なデータソースからナレッジベースへのデータ連携を効率化する。

### 1.2 解決する課題
- 複数のソースからVector Storeへのデータ連携が煩雑
- Vector Store移行時の再実装コスト
- N x N の組み合わせ爆発による開発・保守コストの増大

## 2. 機能要件

### 2.1 コア機能
1. **データソース連携**
   - 様々なデータソースからドキュメントを取得
   - 認証情報の安全な管理
   - 差分同期のサポート

2. **ナレッジベース連携**
   - 各種Vector Storeへのデータアップロード
   - ドキュメントの作成・更新・削除
   - メタデータの管理

3. **設定管理**
   - YAMLベースの設定ファイル
   - 環境変数による秘密情報の管理

### 2.2 Phase 1 対応範囲
- **Data Source Provider**: Notion
- **Knowledge Provider**: Dify
- **Document Format**: Markdown
- **Transform**: なし（パススルー）

### 2.3 将来的な拡張性
- 複数のData Source Provider対応
  - Google Drive
  - GitHub
  - S3
- 複数のKnowledge Provider対応
  - Bedrock Knowledge Bases
  - S3 Vector
- Transform機能の追加
- バッチ処理とリアルタイム処理

## 3. 非機能要件

### 3.1 性能要件
- 初期実装はNode.jsのsingle packageで十分な性能を確保
- 将来的にはGoやRustへの移行も考慮した設計

### 3.2 運用要件
- CLIツールとして実行可能
- エラーハンドリングとリトライ機構
- ログ出力とデバッグ機能

### 3.3 セキュリティ要件
- API認証情報の安全な管理
- 環境変数による秘密情報の分離

## 4. インターフェース仕様

### 4.1 設定ファイル形式
```yaml
sources:
  - provider: notion
    config:
      database_id: DATABASE_ID
      # 認証情報は環境変数から取得

knowledges:
  - provider: dify
    config:
      dataset_id: DATASET_ID
      # 認証情報は環境変数から取得
```

### 4.2 環境変数
- `NOTION_API_KEY`: Notion APIキー
- `DIFY_API_KEY`: Dify APIキー
- `DIFY_API_BASE_URL`: Dify APIのベースURL

## 5. 処理フロー

### 5.1 基本的な処理の流れ
1. 設定ファイルの読み込み
2. データソースからドキュメントの取得
3. ナレッジベースへのアップロード
4. 結果のレポート出力

### 5.2 エラー処理
- APIエラー時のリトライ
- 部分的な失敗の記録と継続処理
- エラーログの出力

## 6. 制約事項

### 6.1 技術的制約
- 初期実装はNode.js (TypeScript)
- ファイルベースのデータ転送（プロトコル非依存）
- パッケージマネージャー: pnpm
- コードフォーマッター:
  - TypeScript/JavaScript: Biome
  - Markdown/YAML/JSON: Prettier

### 6.2 Phase 1 の制約
- Transformなし（Markdown直接転送）
- Embedding処理はDify側に委譲
- 単一ソース・単一ターゲットのみ対応

## 7. 成功指標

1. Notion DatabaseからDify Knowledgeへの自動同期が可能
2. 設定ファイルによる簡単なセットアップ
3. エラー時の適切なフィードバック
4. 将来的な拡張が容易なアーキテクチャ