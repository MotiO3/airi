## 実装修正プラン：Airi の自発的会話（Proactive Prompts）

このドキュメントは、先に作成した `docs/proactive-ai-proactive-prompts.md` を実際にコードへ落とし込むための具体的修正案です。
各案（プロトタイプ / イベント駆動 / モデル駆動）について、変更箇所、修正内容、リスク、検証方法を示します。

作成日: 2026-01-07

---

## 1) プロトタイプ（まず小さく検証）

目的
- 最短でプロアクティブ挙動をユーザーに見せる。アイドル検出 → 定型プロンプト生成 → TTS 再生 のワークフローを確認。

変更ファイル（候補）
- `packages/stage-ui/src/stores/modules/hearing.ts`
  - 既存の streamingSession.idleTimer にフックを追加し、一定時間アイドルが続いたら内部イベントを emit する。
- `packages/stage-ui/src/stores/modules/speech.ts`（存在する場合）または `packages/stage-ui/src/stores/modules/tts.ts`
  - TTS 呼び出しを行う public API を利用して、サーバー/ローカルで生成したメッセージを読み上げる。
- `packages/stage-ui/src/stores/providers.ts` または `packages/stage-pages` のデバッグ UI
  - プロアクティブのオン/オフ、冷却時間、サンプルメッセージを設定できる UI を追加。

修正内容（実装詳細）
- `hearing.ts`:
  - idleTimer のコールバックで `window.dispatchEvent(new CustomEvent('proactive:idle'))` を発火するか、Pinia 内で `emitProactiveRequest()` を作る。
  - 発火条件はデフォルト 30 秒（設定可能）
  - 発火前に `userOptInForProactive` 設定を確認する（UI側でオンにしているか）。
- `speech/tts` ストア:
  - 受け取ったテキストを chunkEmitter 経由で TTS 合成→ クライアントでストリーミング再生する flow を呼び出すラッパー `speakProactive(text, options)` を追加。
- サーバー/LLM:
  - 簡易版: ローカルテンプレート（例：「何かお手伝いできますか？」）を使う
  - オプション: サーバー側の LLM API を叩いてプロンプトを生成するエンドポイント `POST /proactive/prompt` を追加

割り込み
- VAD 検出時に `streamingSession.abortController.abort()` を呼んで TTS を中断する。

検証方法
- 手動テスト：アプリ起動 → 30 秒無音 → プロアクティブ発話されるか確認。発話中に話しかけると即時停止するか確認。
- KPI：発話成功率、割り込み成功率、ユーザーの初期オプトイン率

リスク
- 無関心ユーザーへの割り込み。デフォルトはオフ推奨。

---

## 2) イベント駆動（関連性重視）

目的
- 未完了タスク・重要エラーなど、関連性の高いイベントのみでプロアクティブ化することでノイズを減らす。

変更ファイル（候補）
- 各アプリのイベント発行箇所（例：タスク管理モジュール、エラーログ送信部分）
  - `packages/stage-ui/src/stores/modules/*` の該当モジュール
- 中央的イベント集約サービス（新規）
  - `packages/stage-shared/src/services/proactive-event-aggregator.ts`（新規）
  - もしくは既存の EventBus / Eventa 経路を拡張
- サーバー側スコアリングサービス（新規 microservice）
  - `services/proactive-scorer/`（node サービス）

修正内容（実装詳細）
- イベントの定義:
  - `proactive:event:<type>`（type: task:incomplete, security:alert, feature:new など）を定義
  - イベントに `userId`/`priority`/`payload` を含める
- aggregator:
  - 各サービスは aggregator にイベントを送信。aggregator はユーザーのプロアクティブ設定、直近のプロンプト履歴、レート制限をチェックし、候補を送る
- scorer:
  - 受信イベントに対して関連性スコアを算出（user affinity, recency, priority など）し、一定閾値を超えたら prompt 生成へ流す
- prompt 生成と配信:
  - 生成はテンプレート or LLM。配信は `push` / `websocket` / `tts` 経路を用いる

検証方法
- シミュレーションイベントを発行して aggregator→scorer→配信が期待通り動くか確認

リスク
- イベントの設計が煩雑。イベント洪水時のスループット対策（キュー、バックプレッシャ）を検討

---

## 3) モデル駆動（自律判断）

目的
- LLM や RL ベースの判断で、ユーザー文脈に最適化された自発発話を行う。最も自然だが管理コストと安全対策が必要。

変更ファイル / サービス（候補）
- モデル判定サービス（新規）
  - `services/proactive-planner/`（LLM ラッパー + ポリシーエンジン）
- ポリシーエンジン（新規）
  - 安全ルール（スパム回避、プライバシー、コンテンツフィルタ）をコード化
- ロギング / 監査機能拡張
  - すべての自発発話は監査ログに記録し、ヒューマンレビューができるようにする

修正内容（実装詳細）
- 判定ワークフロー:
  - 入力: ユーザーコンテキスト（直近会話、メモリ、行動ログ、環境シグナル）
  - モデル: LLM に「発話が価値があるか？」の判定を問い合わせ（分類タスク）
  - ポリシー: 判定結果に対して閾値/レート制限/除外ルールを適用
  - 生成: 発話が許可された場合は LLM でメッセージを生成し、TTS で配信
- 安全対策:
  - 有害出力フィルタ、個人情報漏洩フィルタ、コンプライアンスチェック

検証方法
- 限定ユーザーでのベータ運用。自発発話ログを収集し、誤発話率とオプトアウト率を定量化

リスク
- コスト（API 呼び出し）、予測不能な出力、法的リスク。段階的にロールアウトすること

---

## 共通の実装注意点
- ユーザーの明示的同意（オンボード UI）を必須にする
- DND / サイレント時間帯の尊重
- ログと監査: すべてのプロアクティブ発話は監査ログに残す
- テスト: E2E 手動テスト + Vitest ユニットテストを追加

---

## 提案されたパイロット実装（最短で動くもの）
1. `hearing.ts` に idle→`proactive:idle` 発火を追加
2. `stage-ui` の settings に「プロアクティブをオンにする」トグルを追加
3. `speechStore` に `speakProactive()` を追加して、簡易テンプレートを読み上げる
4. 割り込みは既存の abortController を使用して TTS を中断

---

必要であれば、次のステップとして最短プロトタイプのパッチを作成します（`hearing.ts` の idle ハンドラ追加、`speech` ストアの API 拡張、UI 設定追加）。進めて良ければ教えてください。

---

## モデル駆動（Model-driven）: 詳細実装案と具体コード例

以下は、現状の `neuri` ベースの LLM 呼び出し（クラウド LLM 経由）を前提に、モデル駆動方式で安全かつ効率的にプロアクティブ機能を実装するための詳細案です。

### 目的
- ユーザーに高価値で自然な自発発話を提供するため、モデル判定（トリガ判定・スコアリング）と LLM による生成フローを組み合わせる。

### 高レベルのワークフロー
1. イベント／シグナル（idle, task, error, usage pattern等）を受ける
2. 軽量 Decider（ルール + optional classifier）で候補をフィルタ
3. Scorer で関連度を算出し閾値を満たす場合 Planner（LLM）へ送る
4. Planner がメッセージ候補を生成→Policy Engine で安全チェック
5. 配信（TTS / Push / WebSocket）を行い、発話を監査ログに残す

### コンポーネント別の具体実装案

1) Decider（ローカルルール + optional classifier）
- 役割: 明らかに不要なトリガを初期排除（例：オプトアウト済み／DND中／短時間に既にプロアクティブ済み等）
- 実装場所: `packages/stage-shared/src/services/proactive-decider.ts`

擬似コード: `packages/stage-shared/src/services/proactive-decider.ts`

```ts
export interface ProactiveContext {
  userId: string
  eventType: string
  timestamp: number
  metadata?: Record<string, any>
}

export async function shouldTriggerProactive(ctx: ProactiveContext): Promise<{allowed:boolean, reason?:string}> {
  // 1) ユーザー設定（opt-in/out, DND）を確認
  const settings = await getUserProactiveSettings(ctx.userId)
  if (!settings.enabled) return { allowed: false, reason: 'opted-out' }
  if (isInDndWindow(settings, Date.now())) return { allowed: false, reason: 'dnd' }

  // 2) 冷却（cooldown）チェック
  const last = await getLastProactiveTimestamp(ctx.userId)
  if (last && Date.now() - last < settings.cooldownMs) return { allowed: false, reason: 'cooldown' }

  // 3) 必要なら軽量 ML classifier に問い合わせ（オプション）
  // const score = await lightweightClassifier.predict(ctx)
  // if (score < 0.2) return { allowed: false, reason: 'low-score' }

  return { allowed: true }
}
```

変更箇所: `voice.ts` / `hearing.ts` 側で Decider を呼び出す

```ts
// in services/minecraft/.../voice.ts
import { shouldTriggerProactive } from '@proj-airi/stage-shared/services/proactive-decider'

const decision = await shouldTriggerProactive({ userId, eventType: 'idle', timestamp: Date.now() })
if (!decision.allowed) return
// otherwise proceed to scorer/planner
```

2) Scorer + Planner
- Scorer: 複数シグナル（イベント優先度、行動履歴、ユーザープロファイル、時間帯）を統合して数値スコアを返す
- Planner: 実際に LLM を呼んで発話文を生成するサービス。Neuri を使った既存の呼び出しパターン（`agent.handleStateless`）を活用する

サンプル: Scorer API（`services/proactive-scorer/src/index.ts`）

```ts
import express from 'express'

const app = express()
app.use(express.json())

app.post('/score', async (req, res) => {
  const { userId, event } = req.body
  // lookup user history, compute features
  const features = await buildFeatures(userId, event)
  // simple linear scoring for demo
  const score = features.relevance * 0.6 + features.recency * 0.3 + features.priority * 0.1
  res.json({ score })
})

app.listen(3001)
```

サンプル: Planner API（`services/proactive-planner/src/index.ts`）

```ts
import express from 'express'
import { createNeuriAgent } from './neuri-helper'

const app = express(); app.use(express.json())
const agent = createNeuriAgent()

app.post('/plan', async (req, res) => {
  const { userId, context } = req.body
  // build messages array from context and persona template
  const messages = [ system(personaPrompt(userId)), ...context ]
  try {
    const content = await agent.handleStateless(messages, async (c) => {
      // reuse existing handler pattern: handleLLMCompletion-like
      const completion = await c.reroute('action', c.messages, { model: process.env.OPENAI_MODEL })
      return await completion.firstContent()
    })
    res.json({ text: content })
  }
  catch (e) { res.status(500).json({ error: String(e) }) }
})

app.listen(3002)
```

統合例（`voice.ts` 側）

```ts
// after decider passed
const scoreRes = await fetch('http://proactive-scorer:3001/score', { method: 'POST', body: JSON.stringify({ userId, event }) })
const { score } = await scoreRes.json()
if (score < threshold) return

const planRes = await fetch('http://proactive-planner:3002/plan', { method: 'POST', body: JSON.stringify({ userId, context }) })
const plan = await planRes.json()
// policy check -> deliver via TTS
```

3) Policy Engine（安全チェック）
- 役割: 生成結果がプライバシー/コンプライアンス/不適切コンテンツに抵触しないか検査
- 実装案: JSON ベースのルールと正規表現チェック、外部有害コンテンツフィルタ API を組み合わせる

サンプル: `services/proactive-policy/src/index.ts`

```ts
import express from 'express'
const app = express(); app.use(express.json())

app.post('/check', async (req, res) => {
  const { userId, candidate } = req.body
  // simple checks
  if (/\b(社会保障番号|クレジットカード)\b/.test(candidate.text)) {
    return res.json({ allow: false, reason: 'pii' })
  }
  // optionally call third-party safety API
  res.json({ allow: true })
})

app.listen(3003)
```

4) 監査ログとヒューマンレビュー
- proacive 発話は `proactive-audit` サービスに記録。UI でレビュワーが誤発話を確認できるようにする。

### 具体的なリポジトリ内変更例
- `services/minecraft/src/libs/llm-agent/voice.ts`
  - decider 呼び出しと scorer/planner の非同期呼び出しを追加。生成結果を受け取ったら `bot.bot.chat(content)` の代わりに `emitProactiveDelivery(userId, content)` を呼ぶ（配信層分離）。
- `packages/stage-ui/src/stores/modules/hearing.ts`
  - 既存の idleTimer のコールバックに `emitProactiveEvent({ userId, type: 'idle' })` を追加。
- `packages/stage-ui/src/stores/modules/speech.ts`
  - `speakProactive(text)` を追加し、policy チェックを通過したら `speechStore.speech(...)` を呼ぶ。

### テスト & 検証計画（モデル駆動特有）
- 単体: Decider のルール網羅テスト、Scorer の特徴量単体テスト
- 統合: Scorer+Planner の E2E テスト（イベント送出→生成→ポリシーチェック→配信）
- 安全性: Policy Engine の false negative/positive を測定するテストデータセットを作成
- A/B: Scorer の閾値と Planner の temperature を変えて UX を比較

### 運用上の注意点
- LLM 呼び出しにかかるコストの見積もりとモニタリングが必須
- 監査ログは GDPR 等に配慮して、保存期間や匿名化方針を定める

---

必要であれば、このドキュメントに基づいて最初のパッチを作成します（推奨: Decider を追加し、`voice.ts` に統合する小パッチ）。どの部分から実装しましょうか？

---

## プロトタイプ（詳細設計と具体パッチ例）

目的
- 最短で動作確認ができるプロトタイプを作り、UX（割り込み・頻度・文言）の実際の感触を得る。

前提（既存の状態）
- `packages/stage-ui/src/stores/modules/hearing.ts` に streamingSession と idleTimer が既に存在する。
- TTS のチャンク化と再生は `packages/stage-ui/src/utils/tts.ts` と `speechStore` で実装済み。

ターゲット機能
1. 一定時間アイドル（デフォルト 30s）でプロアクティブイベントを発火
2. 発火時に簡易テンプレートを生成（ローカル）して `speakProactive()` を呼ぶ
3. 発話中にユーザーが話し始めたら TTS を中断（既存の abortController を利用）
4. settings にトグル（プロアクティブ ON/OFF）と冷却時間（cooldown）を追加

推奨変更ファイルと差分（擬似パッチ）

1) `packages/stage-ui/src/stores/modules/hearing.ts` の変更
- 概要: idleTimer のコールバック内で Pinia action を呼び出す（emitProactiveEvent）

差分（擬似）:
```diff
*** Update File: packages/stage-ui/src/stores/modules/hearing.ts
@@
-      idleTimer = setTimeout(async () => {
-        await stopStreamingTranscription(false, providerId)
-      }, idleTimeout)
+      idleTimer = setTimeout(async () => {
+        await stopStreamingTranscription(false, providerId)
+        // trigger proactive flow
+        try {
+          // check user settings and cooldown
+          const settings = await providersStore.getProactiveSettings?.()
+          if (settings?.enabled) {
+            // emit a proactive event to the app
+            window.dispatchEvent(new CustomEvent('proactive:idle', { detail: { providerId } }))
+          }
+        }
+        catch (e) { console.warn('failed to emit proactive idle', e) }
+      }, idleTimeout)
```

重要: `providersStore.getProactiveSettings` は UI 側で設定を追加した時に実装する（次項参照）

2) `packages/stage-ui/src/stores/modules/speech.ts`（または既存 speech store）に `speakProactive()` を追加
- 概要: 受け取った文字列を policy チェック（シンプル）→ `speech(...)` を呼び出して TTS を再生

差分（擬似）:
```diff
*** Update File: packages/stage-ui/src/stores/modules/speech.ts
@@
  async function speakProactive(text: string, options?: { voiceId?: string }) {
    // simple policy: avoid empty/very short texts
    if (!text || text.trim().length < 2) return

    // Optional: call policy service
    // const allowed = await policy.check(text)
    // if (!allowed) return

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value)
    const model = activeSpeechModel.value ?? 'default'
    return await speech(provider, model, text, options?.voiceId ?? defaultVoiceId, {})
  }

  return {
    ...
    speakProactive,
  }
```

3) UI: settings トグル追加（`packages/stage-pages/src/pages/settings/providers/speech/...`）
- 概要: `userOptInForProactive` と `proactiveCooldownMs` を localStorage に保持する小さなトグルと入力を追加

4) 配信（クライアント側イベントリスナ）
- 概要: アプリの root または適切なコンポーネントで `proactive:idle` を listen して `speakProactive` を呼ぶ

サンプルコード（イベントリスナ）
```ts
// in App.vue or a top-level component
onMounted(() => {
  window.addEventListener('proactive:idle', async (ev: any) => {
    const prov = ev.detail?.providerId
    const store = useSpeechStore()
    const defaultText = '何かお手伝いできますか？'
    // check cooldown in client (optimistic)
    const settings = await useProvidersStore().getProactiveSettings()
    if (!settings?.enabled) return

    // speak
    await store.speakProactive(defaultText)
  })
})
```

割り込み（中断）実装
- 既存の streamingSession.abortController を利用して TTS 発話中にユーザーが話したら中断する。実装ポイント:
  - TTS 発話を開始する前に `currentProactiveAbortController = new AbortController()` を生成し、再生 API に渡す
  - VAD がユーザー発話を検出したら `currentProactiveAbortController.abort()` を呼ぶ

テストケース（推奨）
- ユニット:
  - idleTimer が発火すると `window` イベントが発火する
  - `speakProactive` は空文字を無視する
- 統合（手動）:
  - アプリを起動 → 30 秒放置 → TTS が再生される
  - TTS 再生中に話しかける → 再生が停止する

運用上の注意点（プロトタイプ版）
- デフォルトはオフにしておき、内部ユーザー（社員）で A/B 評価を行う
- ログで発話回数とオプトアウトを追跡

---

次ステップ
- ご希望なら、上記のプロトタイプ実装パッチ（`hearing.ts` と `speech` store の変更、設定 UI の雛形）を私が作成してコミットします。どれから始めますか？

