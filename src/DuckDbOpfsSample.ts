import { 
    AsyncDuckDB, 
    ConsoleLogger, 
    DuckDBAccessMode,
    AsyncDuckDBConnection
} from '@duckdb/duckdb-wasm'; 

// -------------------------------------------------------------------------
// NOTE: URLインポートはそのまま維持
// -------------------------------------------------------------------------
// @ts-ignore
import DuckDBWorkerURL from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker&url';
// @ts-ignore
import DuckDBWasmURL from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
// -------------------------------------------------------------------------

const DB_FILENAME = 'opfs://debug_test_01_opfs.db'; // OPFSプレフィックスを使用
const TABLE_NAME = 'check_opfs_table';

export class DuckDbOpfsSample {
    private db: AsyncDuckDB | null = null;
    private conn: AsyncDuckDBConnection | null = null;
    private isInitialized: boolean = false;

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn("WebRagEngine is already initialized. Skipping.");
            return;
        }

        console.group("🚀 OPFS VFS INITIALIZATION START (Pure opfs:// Test)");
        
        try {
            // 1. DuckDB Wasmの初期化
            const worker = new Worker(DuckDBWorkerURL, { type: 'module' });
            this.db = new AsyncDuckDB(new ConsoleLogger(), worker);
            await this.db.instantiate(DuckDBWasmURL);
            console.log("DEBUG: Wasmコアのロード完了。");
            
            // 2. DBファイルオープン
            const openStartTime = performance.now();
            await this.db.open({
                path: DB_FILENAME,
                accessMode: DuckDBAccessMode.READ_WRITE,
            });
            const openEndTime = performance.now();
            console.log(`DEBUG: DBファイル (${DB_FILENAME}) のオープン完了。時間: ${Math.round(openEndTime - openStartTime)}ms`);
            
            this.conn = await this.db.connect();
            console.log("DEBUG: DB接続を確立しました。");

            // 3. OPFSブラウザレベルでのファイル存在チェック (変更なし)
            if (!("storage" in navigator) || !navigator.storage.getDirectory) {
              console.log("OPFS (navigator.storage.getDirectory) をサポートしていないブラウザです");
              return;
            }

            // 4. テーブルの永続化テスト (DuckDB側)
            //const tableCheck = await this.conn.query(`SELECT count(*) FROM information_schema.tables WHERE table_name = '${TABLE_NAME}';`);
            const tableCheck = await this.conn.query(`
              SELECT EXISTS (
                SELECT 1 
                FROM information_schema.tables 
                WHERE table_name = '${TABLE_NAME}'
              ) as exists_flag;
            `);
            const tableExists = tableCheck.toArray()[0].exists_flag;
            console.log('tableCheck', tableCheck.toArray()[0])
            
            // 5. テーブル作成・データ挿入ロジック
            
            if (tableExists) {
                console.log(`✅ SUCCESS: [${TABLE_NAME}] は永続化されていました！`);
                
                const dataCheck = await this.conn.query(`SELECT count(*) as row_count FROM ${TABLE_NAME};`);
                const rowCount = dataCheck.toArray()[0]['row_count'];
                console.log(`DEBUG: 既存のレコード数: ${rowCount}件`);

            } else {
                console.log(`⚠️ INFO: [${TABLE_NAME}] は存在しなかったため新規作成しました。`);
                
                await this.conn.query(`
                    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                        id INTEGER, 
                        message VARCHAR, 
                        created_at TIMESTAMP
                    );
                    INSERT INTO ${TABLE_NAME} VALUES (1, 'Initial data for OPFS test', now());
                `);
                console.log("DEBUG: 初回テストデータを挿入しました。");
            }

            this.conn.close();

            this.isInitialized = true;
            console.log("✅ WebRagEngine Initialized and OPFS VFS Checked.");

        } catch (error) {
            console.error("🚨 FATAL: Initialization failed in Pure OPFS Mode:", error);
            this.terminate(); 
            throw new Error(`WebRagEngine initialization failed: ${error}`);
        } finally {
            console.groupEnd();
        }
    }
    
    // ... (terminate メソッドは変更なし) ...
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
    // ... (他のメソッドは削除) ...
}