<script setup lang="ts">
import { ref, onMounted } from 'vue';
// WebRagEngine のパスは、プロジェクト構造に合わせて適宜調整してください
import { WebRagEngine } from '@/src/WebRagEngine'; 

// 画面出力用のリアクティブな配列
const output = ref<string[]>([]);
const log = (message: string) => {
  console.log(message);
  output.value.push(message);
};

// テスト用のRAGエンジンインスタンス
const engine = new WebRagEngine();

// テストに使うドキュメント群
const documents = [
    { content: "TypeScriptは型があるJavaScriptのスーパーセットです。", filepath: "typescript-intro" },
    { content: "名古屋大学は名古屋にある国立大学です。", filepath: "rag-intro" },
    { content: "Veqliteはsqliteをvector-dbとして扱えるようにするTypescriptライブラリです。", filepath: "veqlite-intro" },
];

/**
 * RAGエンジンの全フローを実行するメインテスト関数
 */
const runEngineTest = async () => {
    output.value = [];
    log("--- RAG Engine Test Start ---");
    
    try {
        log("1. 🚀 Engine Initialization (start)...");
        // 🚀 初期化 (START)
        await engine.initialize();
        log("-> Engine Initialized Successfully.");

        log("\n2. 💾 Inserting Documents (set)...");
        // 💾 データの投入 (SET)
        for (const doc of documents) {
            log(`   - Inserting: ${doc.content.substring(0, 15)}...`);
            await engine.insert(doc);
        }
        log("-> All Documents Inserted Successfully.");

        log("\n3. 🔍 Running Search Query (get)...");
        const query = "What is TypeScript?";
        log(`   - Query: "${query}"`);
        
        // 🔍 検索実行 (GET)
        const results = await engine.search(query, 1);

        log("4. Search Results:");
        
        // 結果を表示
        for (const row of results) {
            log(`   - Content: ${row.content}`);
            log(`   - Distance: ${row.similarity_score.toFixed(4)} (Closer to 0 is better)`);
        }
        
    } catch (error) {
        // エラー発生時は赤字で強調
        log(`\n🚨 FATAL ERROR: ${error}`);
        console.error("Full Test Error:", error);
    } finally {
        // ⏹️ 終了処理 (CLOSE) は必ず実行
        log("\n5. 🛑 Engine Termination (close)...");
        engine.terminate();
        log("--- ✨ Test Completed and Engine Closed ---");
    }
};

onMounted(() => {
  runEngineTest();
});
</script>

<template>
  <div>
    <h1>WebRagEngine 動作テスト</h1>
    <pre>
      <div v-for="(line, index) in output" 
           :key="index" 
           :style="{ color: line.includes('ERROR') ? 'red' : line.includes('✅') ? 'green' : 'inherit' }">
        {{ line }}
      </div>
    </pre>
  </div>
</template>

<style scoped>
pre {
  white-space: pre-wrap;
  background-color: #f4f4f4;
  padding: 15px;
  border: 1px solid #ccc;
}
</style>