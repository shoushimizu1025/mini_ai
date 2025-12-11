// WebRagEngine.ts
import { HFLocalEmbeddingModel } from "veqlite";
import { AsyncDuckDB, ConsoleLogger, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

// -------------------------------------------------------------------------
// 🚨 NOTE: これらのURLはプロジェクトのビルド設定に依存します
// 実際には、ビルド後のファイルパスに合わせて調整する必要があります。
// ここでは、現在のテストコードに合わせて ?worker&url サフィックスを維持します。
// -------------------------------------------------------------------------
// @ts-ignore
import DuckDBWorkerURL from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker&url';
// @ts-ignore
import DuckDBWasmURL from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';

// -------------------------------------------------------------------------

/**
 * DBに挿入するドキュメントのデータ構造
 */
export interface DocumentChunk {
  /** 埋め込みを行うドキュメントのテキスト内容。 */
  content: string;
  /** ドキュメントの識別子またはファイルパス。 */
  filepath: string;
}

/**
 * 検索結果のデータ構造
 */
export interface SearchResult {
  /** 検索で最も類似度が高かったドキュメントのテキスト内容。 */
  content: string;
  /** ベクトル距離（0に近いほど類似度が高い）。 */
  similarity_score: number;
}

/**
 * WebRagEngine:
 * ブラウザ (Wasm/Web Worker) 内で完結するベクトル検索 (RAG) エンジンです。
 * DuckDB Wasmとveqlite (ONNXモデル) の初期化、データ投入、検索の複雑なロジックをカプセル化します。
 */
export class WebRagEngine {
  private db: AsyncDuckDB | null = null;
  private conn: AsyncDuckDBConnection | null = null;
  private embeddingModel: HFLocalEmbeddingModel | null = null;
  private DIMENSION: number = 256;
  private isInitialized: boolean = false;

  // --- Public Methods ---

  /**
   * @public
   * 🚀 エンジンを初期化し、DBと埋め込みモデルの準備を完了します。
   * DuckDB Wasmのロード、ONNXモデルの初期化、データベーススキーマの作成を行います。
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn("WebRagEngine is already initialized.");
      return;
    }

    try {
      // 1. 埋め込みモデルの初期化 (veqlite)
      // モデルはIndexedDBにキャッシュされるため、初回以外は高速です。
      this.embeddingModel = await HFLocalEmbeddingModel.init(
        "sirasagi62/ruri-v3-30m-ONNX", // 日本語特化モデルを使用
        this.DIMENSION,
        "q8"
      );
      console.log("✅ Embedding Model Initialized.");

      // 2. DuckDB Wasmの初期化
      // Web Workerを生成し、非同期でDuckDBエンジンを起動します。
      const worker = new Worker(DuckDBWorkerURL, { type: 'module' });
      this.db = new AsyncDuckDB(new ConsoleLogger(), worker);
      await this.db.instantiate(DuckDBWasmURL);
      this.conn = await this.db.connect();
      console.log("✅ DuckDB Wasm Initialized.");

      // 3. データベーススキーマの作成
      // ベクトル検索用のFLOAT配列型のカラムを持つテーブルを作成します。
      await this.conn.query(`
                CREATE TABLE chunks (
                    content VARCHAR, 
                    filepath VARCHAR, 
                    embedding FLOAT[${this.DIMENSION}] 
                );
            `);
      console.log(`✅ DuckDB Schema Created (FLOAT[${this.DIMENSION}]).`);

      this.isInitialized = true;

    } catch (error) {
      console.error("Initialization failed:", error);
      this.terminate(); // 失敗した場合はリソースを解放
      throw new Error(`WebRagEngine initialization failed: ${error}`);
    }
  }

  /**
   * @public
   * 💾 ドキュメントをベクトル化し、データベースに挿入します。(SET)
   * * @param doc - 挿入するドキュメントオブジェクト
   * @returns {Promise<void>}
   */
  public async insert(doc: DocumentChunk): Promise<void> {
    if (!this.conn || !this.embeddingModel) throw new Error("Engine not initialized. Call initialize() first.");

    const embedding = await this.embeddingModel.embedding(doc.content);

    if (!embedding) {
      throw new Error(`Embedding data missing for: "${doc.content}".`);
    }

    // 🚨 【重要回避策】 DuckDB Wasmのバグを回避するため、SQL文字列にデータを直接埋め込みます。
    // （本来はプレースホルダを使うべきですが、動作保証のためこの手法を採用）
    const embeddingString = `[${Array.from(embedding).join(',')}]`;

    await this.conn.query(`INSERT INTO chunks (content, filepath, embedding) VALUES ('${doc.content}', '${doc.filepath}', ${embeddingString});`);
  }


  /**
   * @public
   * 🔍 クエリを実行し、最も類似度の高いドキュメントを取得します。(GET)
   * * @param {string} query - 検索するテキストクエリ
   * @returns {Promise<SearchResult[]>} - 類似度スコア付きの検索結果配列
   */
  public async search(query: string): Promise<SearchResult[]> {
    if (!this.conn || !this.embeddingModel) throw new Error("Engine not initialized. Call initialize() first.");

    const queryEmbedding = await this.embeddingModel.embedding(query);

    if (!queryEmbedding) {
      throw new Error("Embedding data missing for search query.");
    }

    const queryEmbeddingString = `[${Array.from(queryEmbedding).join(',')}]`;

    // 🚨 【重要回避策】 型推論ミスを回避するため、配列リテラルを FLOAT[256] に明示的にキャストします。
    const results = await this.conn.query(`
            SELECT 
                content, 
                array_distance(embedding, CAST(${queryEmbeddingString} AS FLOAT[${this.DIMENSION}])) AS SIMILARITY_SCORE
            FROM chunks
            ORDER BY SIMILARITY_SCORE -- 距離が小さい（類似度が高い）順に並べる
            LIMIT 1;
        `);

    // 結果セットをシンプルなオブジェクトの配列に変換して返却
    return results.toArray().map((row: any) => ({
      content: row.content,
      similarity_score: parseFloat(row.SIMILARITY_SCORE.toFixed(4))
    }));
  }

  /**
   * @public
   * ⏹️ DB接続とWasmワーカーを終了し、リソースを解放します。(CLOSE)
   * @returns {void}
   */
  public terminate(): void {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      this.db.terminate();
      this.db = null;
    }
    this.isInitialized = false;
    console.log("🛑 WebRagEngine terminated.");
  }
}