# mini_ai

Nuxtアプリで、ローカルLLM（WebLLM）の実装を行なったサンプルプロジェクト。

この実装を参考に他のプロジェクトにAIを導入していく。

## モデルの切り替え

plugins/llm-initializer.client.ts で行える。

## モデルの用語

モデル名には`q4f16_1`のような名前がついている。

q0: 高クオリティ。意味: 量子化（圧縮）を最小限に抑えており、モデルが持つ情報量が多く、回答精度が最も高いです。その代わり、VRAM消費とファイルサイズは大きくなります。

q4: 圧縮によるやや劣化。重みを4ビットに圧縮しています。ファイルサイズとVRAM消費が最小になり、推論速度も速くなります。しかし、圧縮の過程で情報の一部を削るため、精度はq0に比べてわずかに落ちる可能性があります。

スマホのことを考えると、`q4f16_1`がベストと思われる。

### itとは？

通常のLLMは、大量のWebテキストを読み込んで単語の並びのパターンを学習します。このモデルは「ベースモデル」と呼ばれ、文章を生成することはできますが、質問に正確に答えたり、特定の形式で要約したりするのは得意ではありません。

そこで、人間との会話の例（質問と回答のペア）を使って追加の訓練（ファインチューニング）を行います。これが指示応答（Instruction Tuning） です。

基本的に it がついたモデルを選択するのが良い。

## 実装メモ

### 必要パッケージインストール

```log
yarn add @mlc-ai/web-llm
```

### ターミナル上に発生するエラー

```log
 ERROR  html.replace is not a function                                        6:12:57 AM

    at generateErrorOverlayHTML (.nuxt/dev/index.mjs:1146:26)
    at errorhandler (.nuxt/dev/index.mjs:1209:51)
    at async errorHandler (.nuxt/dev/index.mjs:1341:7)
    at async Server.toNodeHandle (node_modules/h3/dist/index.mjs:2304:9)
```

WebLLMの大きなファイルを読み込んだり、WASMファイルがロードされるタイミングで、Nuxtの開発サーバーが処理しきれない非同期エラーや警告を短時間で受け取り、エラー情報の加工に失敗した可能性。

Nuxtのバージョン依存: Nuxt 3やその依存パッケージ（特にVite関連）の特定のバージョンでの既知のバグ（多分違うかも）

いずれにせよ、動作に支障はないもののようだ。

### モデルの実態

IndexedDBで保存されるようなのだが、Cache Storageに保存されていた。

devtoolからCache Storageは確認できる。
これはURLとともに管理されており、リクエストしたURLがストレージにあれば、それを優先して取得するようになる。

こちらのzenn記事にも同様のことが書いてあった。
https://zenn.dev/srefin/articles/17ba278f402b5d

## RAGについて

WebLLMは非常に少ないトークン制約がある。

膨大なプロンプトで制御をかけたりせず、効率的に処理させる立ち回りが必要。

記憶の領域で、RAG（ラス）という考え方を取り入れて、膨大な記憶から効率的に関連する情報だけを集約。

### 単体コンポーネントによるRAGの実装

components/testRag.vue

### TypeScriptに独自エンジンを搭載したコンポーネントによるRAGの実装

components/testWebRagEngine.vue
