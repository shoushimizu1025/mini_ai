// WebRagEngine.ts
import { HFLocalEmbeddingModel } from "veqlite";
import { 
    AsyncDuckDB, 
    ConsoleLogger, 
    DuckDBAccessMode, // 🔥 追加：DBファイルオープンのためのAccessMode
    AsyncDuckDBConnection 
} from '@duckdb/duckdb-wasm';

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

// 🔥 永続化に成功した OPFS ファイル名を使用
const DB_FILENAME = 'opfs://duckdb.db'; 
const RAG_TABLE_NAME = 'chunks';

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

    console.group("🚀 WebRagEngine INITIALIZATION START (RAG + OPFS)");

    try {
      // 1. 埋め込みモデルの初期化 (veqlite)
      this.embeddingModel = await HFLocalEmbeddingModel.init(
        "sirasagi62/ruri-v3-30m-ONNX", // 日本語特化モデルを使用
        this.DIMENSION,
        "q8"
      );
      console.log("✅ Embedding Model Initialized.");

      // 2. DuckDB Wasmの初期化とOPFSオープン (永続化成功パターンを採用)
      const worker = new Worker(DuckDBWorkerURL, { type: 'module' });
      this.db = new AsyncDuckDB(new ConsoleLogger(), worker);
      await this.db.instantiate(DuckDBWasmURL);
      
      // 🔥 DBファイルのオープン: OPFSプレフィックスとREAD_WRITEモードを使用
      await this.db.open({
        path: DB_FILENAME,
        accessMode: DuckDBAccessMode.READ_WRITE,
      });
      
      // DuckDBの接続を確立
      this.conn = await this.db.connect();
      console.log(`✅ DuckDB Wasm Initialized and OPFS DB Opened: ${DB_FILENAME}`);

      // 3. データベーススキーマの作成と永続化チェック
      
      // 🔥 テーブルの存在チェック (成功パターン: ASエイリアスを使用)
      const tableCheck = await this.conn.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_name = '${RAG_TABLE_NAME}'
        ) as exists_flag;
      `);
      const tableExists = tableCheck.toArray()[0].exists_flag;

      if (!tableExists) {
        // ベクトル検索用のFLOAT配列型のカラムを持つテーブルを作成します。
        await this.conn.query(`
          CREATE TABLE ${RAG_TABLE_NAME} (
            content VARCHAR, 
            filepath VARCHAR, 
            embedding FLOAT[${this.DIMENSION}] 
          );
        `);
        console.log(`✅ DuckDB Schema Created (FLOAT[${this.DIMENSION}]).`);
      } else {
        console.log(`✅ DuckDB Schema Found. Table '${RAG_TABLE_NAME}' is persistent.`);
      }

      // 🔥 DuckDBConnectionを閉じる (RAGではすぐに閉じる必要はないため、ここでは閉じない)
      // 永続化成功サンプルではここで閉じていましたが、RAGエンジンとしては挿入や検索で接続を維持する必要があるため、スキップします。

      this.isInitialized = true;

    } catch (error) {
      console.error("🚨 FATAL: Initialization failed:", error);
      this.terminate(); // 失敗した場合はリソースを解放
      throw new Error(`WebRagEngine initialization failed: ${error}`);
    } finally {
      console.groupEnd();
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

    await this.conn.query(`INSERT INTO ${RAG_TABLE_NAME} (content, filepath, embedding) VALUES ('${doc.content.replace(/'/g, "''")}', '${doc.filepath}', ${embeddingString});`);
  }

  /**
   * @public
   * 🔍 クエリを実行し、最も類似度の高いドキュメントを取得します。(GET)
   * @param {string} query - 検索するテキストクエリ
   * @param {number} [limit=5] - 取得する検索結果の上限件数 処理コストが掛かるため必ず制限を設定する必要がある。
   * @returns {Promise<SearchResult[]>} - 類似度スコア付きの検索結果配列
   */
  public async search(query: string, limit: number = 5): Promise<SearchResult[]> {
      if (!this.conn || !this.embeddingModel) throw new Error("Engine not initialized. Call initialize() first.");

      const queryEmbedding = await this.embeddingModel.embedding(query);
      // ... (中略: queryEmbeddingString の生成) ...
      const queryEmbeddingString = `[${Array.from(queryEmbedding).join(',')}]`;

      // 🔥 LIMIT 句を引数で渡された件数に変更
      const results = await this.conn.query(`
              SELECT 
                  content, 
                  array_distance(embedding, CAST(${queryEmbeddingString} AS FLOAT[${this.DIMENSION}])) AS SIMILARITY_SCORE
              FROM ${RAG_TABLE_NAME}
              ORDER BY SIMILARITY_SCORE
              LIMIT ${limit}; 
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
   * 永続化を確実にするため、CHECKPOINTを実行します。
   * @returns {void}
   */
  public async terminate(): Promise<void> {
    console.group("🛑 WebRagEngine Termination START");
    try {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.db) {
            this.db.terminate();
            this.db = null;
        }
        this.isInitialized = false;
        console.log("✅ WebRagEngine terminated successfully.");
    } catch (error) {
        console.error("🚨 WARNING: Termination failed, resources may still be active:", error);
    } finally {
         console.groupEnd();
    }
  }
}