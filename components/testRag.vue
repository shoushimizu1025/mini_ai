<script setup lang="ts">
// Vueのリアクティビティとライフサイクルフックをインポート
import { ref, onMounted } from 'vue';

// Veqliteからローカル埋め込みモデルをインポート
// Veqliteは、ブラウザ内でHugging FaceのONNXモデルを実行し、テキストをベクトルに変換する役割を担う
import { HFLocalEmbeddingModel } from "veqlite";

// DuckDB Wasmのコア機能（非同期DB、ロガー）をインポート
import {
  AsyncDuckDB,
  ConsoleLogger,
  VoidLogger
} from '@duckdb/duckdb-wasm';

// DuckDB WasmをWeb Workerとして動作させるためのスクリプトとWASMファイルをインポート
// Workerを使うことで、DB操作がUIスレッドをブロックするのを防ぐ
// ?worker&url という特殊なサフィックスを付けることで、Nuxt/Vite はこれらのファイルを「コードとして扱う」のではなく、
// 「静的アセット（ブラウザがロードすべきファイル）」として認識します。
import DuckDBWorkerURL from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker&url';
import DuckDBWasmURL from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';

// 画面出力用のリアクティブな配列
const output = ref<string[]>([]);
const log = (message: string) => {
  console.log(message);
  output.value.push(message);
};

const runRAGTest = async () => {
  // データベース接続用の変数を初期化
  let db: AsyncDuckDB | null = null;
  let conn: any | null = null;

  // クエリ結果を格納するための変数。try/catchブロックの外で宣言し、スコープを確保する
  let results: any = null;

  // 埋め込みモデルの次元を定義 (sirasagi62/ruri-v3-30m-ONNX は256次元)
  // テキストの意味を表現するために使用される数字の長さ
  // テキスト（単語、フレーズ、文章）をコンピューターが理解できるようにするには、それらを数値のリストに変換する必要があります。
  // この数値のリストが**ベクトル（Vector）であり、このプロセスが埋め込み（Embedding）**です。
  const DIMENSION = 256;

  output.value = [];

  try {
    log("1. Embedding Model Initialization...");

    // Veqliteを使って、ローカルのHugging Faceモデルを初期化
    // これにより、テキストがベクトルに変換可能になる
    // @ts-ignore
    const embeddingModel = await HFLocalEmbeddingModel.init(
      "sirasagi62/ruri-v3-30m-ONNX", // 使用するモデル名
      DIMENSION,                    // 埋め込みベクトルの次元
      "q8"                          // 量子化形式（パフォーマンス向上に寄与）
    );

    log("2. DuckDB Wasm Initialization...");

    // Web Workerを生成し、非同期でDuckDBを実行
    const worker = new Worker(DuckDBWorkerURL, { type: 'module' });
    const logger = new ConsoleLogger();

    // DuckDBインスタンスを初期化し、WASMファイルをロード
    db = new AsyncDuckDB(logger, worker);
    await db.instantiate(DuckDBWasmURL); // DBのコアエンジンをブラウザメモリにロード

    // DBに接続（インメモリDBとして動作するため、リロードでデータは消える）
    conn = await db.connect();
    log("-> DuckDB Wasm Initialized Successfully.");

    // 3. DuckDB Schema の作成
    // ベクトル検索のために、埋め込みを格納するFLOAT配列型のカラムを持つテーブルを作成
    // 'vector'拡張機能は不要（コアに組み込まれているため）
    await conn.query(`
      CREATE TABLE chunks (
        content VARCHAR, 
        filepath VARCHAR, 
        embedding FLOAT[${DIMENSION}] -- 256次元の浮動小数点配列型
      );
    `);
    log(`3. DuckDB Schema Created (FLOAT[${DIMENSION}]).`);

    // 4. データの埋め込みと挿入
    const documents = [
      { content: "TypeScriptは型があるJavaScriptのスーパーセットです。", filepath: "typescript-intro" },
      { content: "名古屋大学は名古屋にある国立大学です。", filepath: "rag-intro" },
      { content: "Veqliteはsqliteをvector-dbとして扱えるようにするTypescriptライブラリです。", filepath: "veqlite-intro" },
    ];

    log("4. Inserting Documents...");
    for (const doc of documents) {
      // テキストを埋め込みベクトル（Float32Array）に変換
      const embedding = await embeddingModel.embedding(doc.content);

      // 埋め込み生成が失敗していないかチェック
      if (!embedding) {
        throw new Error(`Embedding data is missing for document: "${doc.content}". Model output was incomplete.`);
      }

      // **【重要回避策】** DuckDB Wasmのパラメータバインディングのバグを回避するため、
      // Float32ArrayをSQLの配列リテラル（例：'[0.1, 0.2, ...]'）として文字列に変換し、クエリに直接埋め込む
      const embeddingString = `[${Array.from(embedding).join(',')}]`;
      console.log(`[LOG] Inserting embedding string (first 10 elements): ${embeddingString.substring(0, 100)}...`);

      // プレースホルダ（?）を使わず、SQL文字列にデータを直接埋め込み挿入
      await conn.query(`INSERT INTO chunks (content, filepath, embedding) VALUES ('${doc.content}', '${doc.filepath}', ${embeddingString});`);
    }
    log("-> Documents and Embeddings Inserted Successfully.");

    // 5. 検索クエリの実行
    const query = "What is TypeScript?";
    const queryEmbedding = await embeddingModel.embedding(query); // クエリテキストもベクトルに変換

    if (!queryEmbedding) {
      throw new Error("Embedding data is missing for the search query. Model output was incomplete.");
    }

    const queryEmbeddingString = `[${Array.from(queryEmbedding).join(',')}]`;
    console.log(`[LOG] Query embedding string (first 10 elements): ${queryEmbeddingString.substring(0, 100)}...`);


    // **【重要回避策】** 
    // 1. クエリ埋め込みベクトルを文字列として直接クエリに埋め込む
    // 2. DuckDBが配列リテラルをDECIMAL型と誤認する問題を回避するため、
    //    CAST(...) AS FLOAT[256] を使用して、明示的に型を FLOAT[256] に指定する
    results = await conn.query(`
      SELECT 
          content, 
          -- array_distance() 関数が、DBのFLOAT[256]とキャスト後のFLOAT[256]の距離を計算
          array_distance(embedding, CAST(${queryEmbeddingString} AS FLOAT[${DIMENSION}])) AS SIMILARITY_SCORE
      FROM chunks
      ORDER BY SIMILARITY_SCORE -- 距離が小さい（類似度が高い）順に並べる
      LIMIT 1;
    `);

    log(`\nQuery: ${query}`);
    log("5. Search Results:");

    // 結果セットを配列に変換して反復処理し、ログに出力
    for (const row of results.toArray()) {
      log(`- ${row.content} (Distance: ${row.SIMILARITY_SCORE.toFixed(4)})`);
    }

  } catch (error) {
    // エラー発生時の処理
    // @ts-ignore
    log(`Error in RAG Test: ${error.message}`);
    console.error("Full Error:", error);
  } finally {
    // DB接続とインスタンスの終了処理（リソースの解放）
    if (conn) {
      conn.close();
    }
    if (db) {
      db.terminate();
    }
    log("\n--- ✨ Test Completed and DB Closed ---");
  }
};

onMounted(() => {
  runRAGTest();
});
</script>

<template>
  <div>
    <h2>DuckDB Wasm RAG Test Output</h2>
    <div v-for="(line, index) in output" :key="index" :style="{ color: line.startsWith('Error') ? 'red' : 'inherit' }">
      {{ line }}
    </div>
  </div>
</template>