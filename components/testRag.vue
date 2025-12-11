<script setup lang="ts">
import { ref, onMounted } from 'vue';
// @ts-ignore
import { HFLocalEmbeddingModel } from "veqlite"; 

// 必要な関数を名前付きで直接インポート
import { 
    AsyncDuckDB, 
    ConsoleLogger, 
    VoidLogger
} from '@duckdb/duckdb-wasm';

// Worker/WASMファイルをURL文字列としてインポート
// @ts-ignore
import DuckDBWorkerURL from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?worker&url'; 
// @ts-ignore
import DuckDBWasmURL from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'; 


const output = ref<string[]>([]);
const log = (message: string) => {
  console.log(message);
  output.value.push(message);
};

const runRAGTest = async () => {
    let db: AsyncDuckDB | null = null;
    let conn: any | null = null;
    // 🔥 [修正点 1] results を try ブロック外で宣言し、スコープを広げる
    let results: any = null; 
    const DIMENSION = 256; 
    
    output.value = [];
    
    try {
        log("1. Embedding Model Initialization...");
        // @ts-ignore
        const embeddingModel = await HFLocalEmbeddingModel.init(
            "sirasagi62/ruri-v3-30m-ONNX", 
            DIMENSION, 
            "q8"
        );

        log("2. DuckDB Wasm Initialization...");
        
        const worker = new Worker(DuckDBWorkerURL, { type: 'module' }); 
        const logger = new ConsoleLogger();
        
        db = new AsyncDuckDB(logger, worker);
        await db.instantiate(DuckDBWasmURL);

        conn = await db.connect(); 
        log("-> DuckDB Wasm Initialized Successfully.");

        // 3. DuckDB Schema の作成
        await conn.query(`
          CREATE TABLE chunks (
            content VARCHAR, 
            filepath VARCHAR, 
            embedding FLOAT[${DIMENSION}] 
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
            const embedding = await embeddingModel.embedding(doc.content);
            
            if (!embedding) { 
                throw new Error(`Embedding data is missing for document: "${doc.content}". Model output was incomplete.`);
            }
            
            const embeddingString = `[${Array.from(embedding).join(',')}]`;
            console.log(`[LOG] Inserting embedding string (first 10 elements): ${embeddingString.substring(0, 100)}...`);

            await conn.query(`INSERT INTO chunks (content, filepath, embedding) VALUES ('${doc.content}', '${doc.filepath}', ${embeddingString});`);
        }
        log("-> Documents and Embeddings Inserted Successfully.");
        
        // 5. 検索クエリの実行
        const query = "What is TypeScript?";
        const queryEmbedding = await embeddingModel.embedding(query);
        
        if (!queryEmbedding) {
            throw new Error("Embedding data is missing for the search query. Model output was incomplete.");
        }

        const queryEmbeddingString = `[${Array.from(queryEmbedding).join(',')}]`;
        console.log(`[LOG] Query embedding string (first 10 elements): ${queryEmbeddingString.substring(0, 100)}...`);


        // 🔥 [修正点 2] const を削除し、外側で宣言した results 変数に代入
        results = await conn.query(`
            SELECT 
                content, 
                array_distance(embedding, CAST(${queryEmbeddingString} AS FLOAT[${DIMENSION}])) AS SIMILARITY_SCORE
            FROM chunks
            ORDER BY SIMILARITY_SCORE
            LIMIT 1;
        `); 

        log(`\nQuery: ${query}`);
        log("5. Search Results:");
        
        // results の参照は try ブロック内で完結させる方が安全ですが、
        // ユーザーが意図するロジック（エラー時に結果表示をスキップ）を優先し、この構造を維持します。
        for (const row of results.toArray()) {
            // @ts-ignore
            log(`- ${row.content} (Distance: ${row.SIMILARITY_SCORE.toFixed(4)})`);
        }
        
    } catch (error) {
        // @ts-ignore
        log(`Error in RAG Test: ${error.message}`);
        console.error("Full Error:", error);
    } finally {
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