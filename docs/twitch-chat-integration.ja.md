Twitchチャット → AIチャット連携設計

目的

AIRi（AIRI）でライブのTwitchチャットを取り込み、選別したメッセージをAIチャットプロバイダ（既存のプロバイダシステム）に渡して、要約・質問応答・モデレーション支援・インタラクティブなボット応答などを実現します。

設計概要

コンポーネント

- Twitch取り込みレイヤ（サーバまたはクライアント）: IRC（tmi.twitch.tv）やPubSub/EventSubを使ってTwitchチャットに接続します。認証、再接続、レート制御を行い、正規化されたチャットイベントを発行します。

- メッセージフィルタ/ポリシー: どのメッセージをAIへ転送するかを決めるルール群（コマンド、メンション、購読者限定、言語検出、ブラックリスト/ホワイトリスト、不適切語フィルタ、スパム検知）。メモリ上のルールと設定の永続化を併用します。

- キューイング & バッチ処理: メッセージをバッファしてAIプロバイダへの送信負荷やレート制限を吸収します。即時転送、固定数バッチ、スライディングウィンドウ（例: 5秒間隔）などの方式を選べるようにします。

- AIコネクタ: 既存の `providers` ストアを再利用してOpenAIなどのチャットプロバイダにメッセージを渡します。会話コンテキスト管理、ロール割当、バックオフ処理を行います。

- UIコンポーネント: アプリ内のTwitchチャットビュー、転送トグル、フィルター設定、手動転送ボタン。転送状況やAIの応答を表示します。

- 永続化: OAuthトークンは既存の `settings/credentials/providers` に保存し、チャネルごとの設定は localStorage またはアプリ設定ストアに保存します。

- テレメトリ & ロギング: 転送イベント、エラー、レート制限イベント等を記録します。ログに残すメッセージはPIIをマスキングします。

データフロー

1. 管理者がAIRiの設定でTwitchチャネルとOAuth資格情報を登録する。
2. 取り込みレイヤがチャット（IRCまたはPubSub）に接続する。
3. チャットメッセージがイベントとして到着: { id, channel, user, text, badges, emotes, timestamp }
4. メッセージフィルタで振り分け（破棄／転送）。転送されるメッセージには転送理由やユーザロールなどのメタデータを付与。
5. メッセージはキュー／バッチ処理へ渡され、AIコネクタに送信される（即時またはまとめて）。
6. AIコネクタがプロバイダにリクエストを送り、応答を受け取る。
7. 応答は保存・UI表示され、オプションでTwitchチャットへ投稿される（デフォルトはオフ推奨）。

トランスポートの選択

- IRC (tmi.twitch.tv): 実装が容易でクライアント向け。複数チャネルの参加が容易。イベントの粒度は限定的。
- PubSub / EventSub: より豊富なイベント（ビッツ、サブスクなど）をサポート。Webhookや永続接続を要求しTwitchアプリ登録が必要。

推奨: MVPはまずIRCで実装し、必要に応じてPubSub/EventSubを追加する。

認証

- OAuthトークン（ボット/ユーザ）を使用。読み取りのみなら chat:read、投稿するなら chat:edit 等のスコープが必要。
- トークンは `settings/credentials/providers` に保存し、デスクトップでは安全なストレージを使う。サーバー側利用時は環境変数やシークレットマネージャを利用。

フィルタリングと安全性

- 基本フィルタ: ブラックワード、短すぎるメッセージ、言語判定での非日本語除外（任意）。
- 信頼レベル: モデレーターやVIPは高信頼、購読者は中信頼、その他は低信頼。デフォルトはメンションや高信頼者のみ転送する設定が安全。
- レート制御とバックオフ: AIプロバイダの制限に合わせてキュー処理を行い、429応答時は指数バックオフ。

AIプロンプト設計

- メッセージをプロンプトテンプレートにマッピングします。例（単発転送）:

  System: "あなたは日本語のTwitchチャット向けに有用なアシスタントです。"
  User: "[username] の質問: [message text]"

- バッチ送信の場合: 最近のN件を区切り文字でまとめ、AIにそれぞれに回答するように指示する（"ANSWER:" ラベルなど）。
- 会話コンテキストは小さく保つ（チャネルごとに直近M件を保持）。チャネル別にコンテキストリセットを行えるようにする。

チャットへ投稿する場合の注意

- 応答をそのままチャット投稿するのはリスクがあるためデフォルトでは無効にし、管理者が明示的に許可した場合のみ。投稿時は投稿レートに注意し、ボット表記や管理者承認フローを用意。

UIの変更

- 設定ページ: "Twitch" セクションを追加。アカウント接続、チャネルリスト、転送トグル、フィルタ設定を提供。
- ライブビュー: Twitchチャットパネル（読み取り専用）、メッセージの手動転送ボタン、転送ログ・応答表示。

実装計画（MVP）

1. 設定画面でTwitch資格情報（トークン）を登録できるようにする（`providers` ストアを再利用）。
2. `packages/twitch-client`（または `packages/stage-shared/twitch`）モジュールを作る:
   - tmi/IRCクライアント（または軽量WebSocketベース）を実装。
   - 正規化イベントを発行、再接続ロジック、最小限のレート制御を備える。
3. メッセージフィルタサービスを `packages/stage-shared` に実装（ブラックリスト/ホワイトリスト、メンション判定など）。
4. `packages/stage-ui` のストアにキューとAIコネクタを実装:
   - `useProvidersStore` を使ってAIプロバイダを選択
   - メッセージバッチングとスロットリングを実装
5. UIコンポーネントを追加:
   - `TwitchChatPanel.vue`
   - `TwitchSettings.vue`
6. テストとドキュメント作成

セキュリティとプライバシー

- ウィスパー（個別メッセージ）等の非公開情報はデフォルトで転送しない。
- ログ保存はPIIをマスク／ハッシュして保存。
- OAuthは最小スコープで運用し、トークンの取り消しをサポート。

監視とメトリクス

- 受信/転送/レート制限/失敗のカウントを出力。
- デバッグ用に（PIIを赤actedした）サンプル転送メッセージとAI応答をログに残す。

ロードマップと拡張

- EventSubサポートでより豊富なイベントを取り込み。
- 自動モデレーション（有害性検出）機能の統合。
- 大規模チャンネル向けにサーバーサイドの中継コンポーネントを追加。

MVPの受け入れ基準

- 管理者がTwitchのトークンとチャネルを設定できること
- 設定したチャネルのチャットがアプリ内で表示されること
- メッセージを手動または自動でAIへ転送でき、基本的なフィルタが働くこと
- AIの応答がUIに表示されること（チャット投稿は任意）

完成物

- `packages/stage-shared` または `packages/twitch-client` にTwitch IRCクライアント（正規化イベント）
- `packages/stage-ui` にキューとAIコネクタのストア実装
- UI（設定パネル・チャットパネル）コンポーネント
- 本設計ドキュメント（このファイル）

注記

- MVPはまずIRCのみを対象にし、チャットでのメンションや特定フラグに対してのみ転送するなど、安全性を重視したデフォルト設定にしてください。

--

段階的実装：Twitch設定UIを既存メニューに追加するための具体的実装案

目的

まずはアプリの既存メニュー（設定画面）に「Twitch」項目を追加し、対象の配信URL（チャンネル名）とOAuth情報（トークン）を入力・管理できるようにします。最初の段階ではトークンを直接入力する方式を採り、将来的にOAuthフロー（ブラウザを開いて認可）を実装します。

実装概要（段階1: 設定UI +保存）

- UI: 設定ページに `Twitch` セクションを追加。フォーム項目:
   - チャンネル表示名 / 配信URL（例: https://twitch.tv/<channel>）
   - チャンネルID（自動検出オプション）
   - OAuth トークン（プレーンテキスト入力）
   - スコープの注意書き（読み取りのみ: chat:read、投稿する場合は chat:edit 等）
   - 保存ボタン / 接続テストボタン（接続確認のため小さなAPI呼び出しを実行）

- ストア: 既存の `providers` ストアを再利用して Twitch 資格情報を格納。
   - キー: `settings/credentials/providers.twitch` または `settings/credentials/providers/twitch`（既存パターンに合わせる）
   - 値: { apiKey: '<oauth-token>', channel: '<channel-name>', baseUrl?: '' }

- バリデーション:
   - チャンネル名が正しい形式であること（英数字, underscore など）
   - トークンは非空（将来的にスコープチェックを行う）

- 接続テスト:
   - IRCへ接続する前に簡易的な検証をする。Twitch API (helix) で `GET https://api.twitch.tv/helix/users?login=<channel>` を呼び、200応答を確認（要Client-ID/Authorization）。MVPでは省略してトークンでIRC接続を行い、接続成功でOKとする。

実装概要（段階2: OAuthフローと接続のUX向上）

- OAuth自動取得ボタン: ブラウザでTwitchのOAuth許可ページを開き、リダイレクトでトークンを取得する（デスクトップアプリではカスタムURIスキームやローカルサーバーを使う）。
- トークンのミニマムスコープ検査: 受け取ったトークンでTwitch Helixの `GET /users` を呼び、トークンの有効性とユーザ割当を確認する。

ファイル/編集箇所（リポジトリ内の変更提案）

以下は実際に修正/追加するファイル候補と概要です。実装は apps/stage-web と apps/stage-tamagotchi の両方で必要ですが、まずは `packages/stage-ui` に共通コンポーネントを作り、各アプリから読み込む形にするのが望ましいです。

- packages/stage-ui/src/components/settings/TwitchSettings.vue
   - Twitch設定フォーム（チャンネル、トークン、接続テスト、削除）
   - uses `useProvidersStore()` の API を使って資格情報を保存

- packages/stage-ui/src/components/TwitchChatPanel.vue
   - ライブチャット表示 + 手動転送ボタン（将来のUI）

- packages/stage-ui/src/stores/providers.ts (既存)
   - `buildOpenAICompatibleProvider` を真似し、`twitch` 用の provider 定義（UI上の一覧に表示されるように）を追加（ただし実際の接続は別モジュールで行う）

- packages/stage-shared/src/services/twitch-client.ts (新規)
   - 軽量クライアントWrapper（IRC接続やイベント emit を管理）

- apps/stage-web/src/pages/settings/Providers (既存の providers 設定画面に Twitch を追加)
   - `pages/settings/providers/transcription` などと同じ構成で `providers/twitch` 用のページを追加

- i18n: packages/i18n に下記キーを追加
   - settings.pages.providers.twitch.title
   - settings.pages.providers.twitch.description
   - settings.pages.providers.twitch.form.channel
   - settings.pages.providers.twitch.form.token
   - settings.pages.providers.twitch.actions.connect
   - settings.pages.providers.twitch.actions.test

API契約（内部）

- 保存形式（localStorage / providers credentials）
   - { providerId: 'twitch', apiKey: '<token>', channel: '<channel-name>', createdAt: '<iso>' }

- 接続テスト：twitch-client が `connect()` を呼ばれたときに `connected` / `error` イベントを発行する。UIはこれを待って接続成功/失敗を表示。

UX詳細

- 新規接続フロー
   1. ユーザが設定→Twitchを開く
 2. チャンネル名とトークンを入力（トークン欄にOAuth取得のリンクを表示）
 3. 接続テストを押すと `twitch-client.connect()` を呼び、成功時に保存ボタンを活性化
 4. 保存ボタンで `providers` ストアに保存

- 削除フロー
   - 保存済みの接続を削除するボタンを提供。削除時に確認ダイアログを表示。

セキュリティ注意点

- トークンは可能な限り安全に扱う（デスクトップでは OS のセキュアストレージ、Web では同意の上で localStorage）。
- UI上はトークンを隠す（パスワード入力風）にするか、マスク表示（最初と最後の数桁のみ表示）にする。

テスト計画

- 単体テスト: `TwitchSettings.vue` のフォームバリデーションと `providers` ストアへの保存操作をテスト
- 統合テスト: モックの `twitch-client` を用いて接続テスト（成功・失敗）をテスト

マイルストーン

1. `packages/stage-ui` に `TwitchSettings.vue` を追加して既存の settings menu に項目を表示（UIのみ）
2. `twitch-client` の軽量実装（接続テスト）を作り、UIの接続テストボタンと連携
3. `providers` ストアへ保存・削除を実装
4. チャット表示パネル（読み取り専用）を作成し、受信イベントを表示

小さな注意

- まずは"入力方式（トークン手入力）"で素早く実装し、ユーザ反応を見ながらOAuthの自動取得を追加するのがスピード感の面でおすすめです。

次のアクション

私がこれを実装する場合は、まず `packages/stage-ui/src/components/settings/TwitchSettings.vue` の雛形を作り、`packages/stage-shared/src/services/twitch-client.ts` の最小接続テストを追加します。作業に移してよければお知らせください。

追記: これまでに実装した内容（現状）

- ブラウザ側の最小クライアント
  - `packages/stage-shared/src/services/twitch-client.ts` に WebSocket ベースの最小クライアントを追加しました。
  - PING/PONG、PRIVMSG の簡易パース、`onMessage(handler)` サブスクライブ API を提供します。
  - 目的: 設定 UI や開発用の受信テスト UI と素早く連携するための軽量クライアント。

- UI（開発向け）
  - `packages/stage-pages/src/pages/settings/providers/twitch-settings.vue` を追加しました。チャンネルと OAuth トークンを入力し、接続テスト・保存ができます。
  - `packages/stage-pages/src/pages/devtools/twitch-test.vue` を追加しました。保存済み設定を使って接続し、受信チャットメッセージを一覧表示できます。

- アプリ内ストア
  - `packages/stage-ui/src/stores/modules/twitch-integration.ts` を追加しました。
  - `useTwitchIntegrationStore` を通じて start/stop、受信メッセージのバッファリング、簡易 `forwardToProvider(providerId)` を実装しています（直近最大10件をまとめて送信する簡易フロー）。

- サーバー側の安定実装（tmi.js ベース）
  - `services/twitch-ingest` サービスを追加しました（MVP サーバー）:
    - `services/twitch-ingest/src/index.js` : express + tmi.js + ws を使った小さなサービス。
    - POST `/listen` で OAuth・ユーザー名・チャネル配列を受け取り tmi.js で接続、受信メッセージを WebSocket 接続クライアントへブロードキャストします。
    - POST `/forward` は（環境変数 `OPENAI_API_KEY` が設定されていれば）OpenAI Chat API へ簡易フォワードができます。
    - README を同梱しています（起動方法と簡単な API 仕様）。

補足（現状の使い分け）
- 開発や軽いテスト：ブラウザの最小クライアント + `devtools/twitch-test.vue` を使って素早く受信動作を確認できます。
- 安定運用や大規模チャンネル：`services/twitch-ingest` を使いサーバー側で永続接続・再接続・レート管理を行うことを推奨します。

簡易実行手順（サーバー）

1. services/twitch-ingest に移動して依存を入れる:

```bash
cd services/twitch-ingest
pnpm install
```

2. サービス起動（OpenAI 連携を使う場合は環境変数を指定）:

```bash
OPENAI_API_KEY=sk-... pnpm start
```

3. /listen エンドポイントに接続要求を投げる（例）:

```json
POST http://localhost:3001/listen
{
  "oauth": "<token_without_prefix>",
  "username": "bot_username",
  "channels": ["channel1", "channel2"]
}
```

次に行うべきアクション（推奨プラン）

以下はプライオリティを付けた短期（MVP）→中期→本番化のアクションリストです。各項目は私が実装・コミットできます。

短期（今週〜数日） — MVP の完成と結合

1. UI とサーバーの接続を結合する（推奨）
   - `twitch-settings.vue` の「接続テスト/保存」を `/listen` に POST するように変更し、サーバーが起動している環境で自動的にチャンネルを監視できるようにします。
   - `devtools/twitch-test.vue` を WebSocket（`ws://<host>:3001`）に接続して、サーバーからの `twitch:message` の受信を表示するように変更します。
   - 成果: 管理画面からボタン一つでサーバー監視を開始・停止でき、アプリ側で受信が見える。

2. `forwardToProvider` の動線確認と簡易統合テスト
   - `useTwitchIntegrationStore.forwardToProvider` をボタン化して、選択したプロバイダに対して手動転送を実施できるようにします（devtools ページに追加）。
   - 簡易の E2E: サーバー経由で受信 → devtools で確認 → 手動転送 → AI応答が返る（UI 表示）。

中期（数週間） — 信頼性と安全性向上

3. 本番向けのトークン管理と運用
   - サーバー側でトークンを安全に保管（Vault / 環境変数 / シークレットマネージャ）する設計にする。
   - UI 側はトークンを平文で置かず、サーバーを経由して接続情報を登録するフローにする。

4. 再接続・バックオフ・レート制御の強化
   - `services/twitch-ingest` における tmi.js の設定と、AI 転送に対するスロットリング（バッチ、閾値、429 応答時の指数バックオフ）を実装。

5. メッセージパースとメタデータ強化
   - IRC タグの詳細パース（バッジ、emotes、message-id）や、メッセージごとの言語判定/スパムスコアを付与。

本番（必要に応じて） — 大規模運用とモデレーション

6. EventSub / PubSub 連携
   - サブスクライブ型のイベント（サブスクライブ、ビッツ、ホスト等）を取り込むため EventSub を追加。

7. 自動モデレーションとフィルタのルールエンジン
   - AI を使った有害性判定、自動フィルタ適用、モデレーターへのサジェスト実装。

補足: 私が次に行う作業（提案）

- まずは短期 1 と 2 を実施してワークフロー（管理画面 → サーバー監視 → アプリ受信 → 手動転送）の End-to-End を作ります。これで実運用前の UX と基本の安全チェックが確認できます。
- 作業量は小分けでコミットします。最初のプルリクは UI の接続テストを `/listen` に繋げ、devtools 側に「Forward to provider」ボタンを追加する内容になります。

---

必要なら、今すぐ短期作業（UI とサーバーの接続結合）をこのブランチで実装します。続けてよければ「実装を開始してください」とお知らせください。

