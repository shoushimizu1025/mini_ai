// plugins/llm-initializer.client.ts

import { defineNuxtPlugin } from '#app';
// setGlobalEngine をインポートに追加
import { useLLMGlobalStore, setGlobalEngine } from '~/composables/useLocalLLM'; 

let hasLLMInitialized = false; 

export default defineNuxtPlugin(async (nuxtApp) => {
  if (hasLLMInitialized) return;
  
  nuxtApp.hook('app:mounted', async () => {
    if (hasLLMInitialized) return;

    const store = useLLMGlobalStore(); 
    if (store.value.isReady || store.value.isInitializing) return;

    store.value.isInitializing = true;
    store.value.status = "ライブラリロード中...";

    await new Promise(resolve => setTimeout(resolve, 50)); 
    
    let webllm;
    try {
        webllm = await import("https://esm.run/@mlc-ai/web-llm"); 
    } catch (e) {
        store.value.status = "インポート失敗";
        store.value.isInitializing = false;
        return;
    }
    
    const webllmFunctions = webllm.default || webllm;
    const CreateEngine = webllmFunctions.CreateWebWorkerEngine || webllmFunctions.CreateMLCEngine;

    try {
        store.value.status = "エンジン初期化中...";
        // WebLLM こいつは将来的にpackage管理で良い0.2.80が最新らしい
        // https://webllm.mlc.ai/docs/index.html
        const Wasm_URL_Base = "https://esm.run/@mlc-ai/web-llm@0.2.80/";

        // これがLLMモデル定義
        // ここからモデルの正式名称が確認できる
        // https://chat.webllm.ai/
        // 
        // Phi-3-mini: Microsoft が開発した小型のLLM
        // Phi-3-mini-4k-instruct-q4f16_1-MLC
        //
        // Llama-3-8B: Meta が開発した大規模言語モデルの最新版
        // Llama-3-8B-Instruct-q4f16_1-MLC 
        //
        // Mistral-7B: フランスのMistral AIが開発したモデルで、その処理の速さと、サイズに対する性能の高さが特徴
        // Mistral-7B-Instruct-v0.2-q4f16_1-MLC
        //
        // Gemma-2B: Googleが開発した軽量モデル。非常に小さい20億パラメータで動作し、特に推論速度が速い
        // Gemma-2B-Instruct-q4f16_1-MLC
        // 日本語特化で安定していた: gemma-2-2b-jpn-it-q4f16_1-MLC
        const LOCAL_LLM = "gemma-2-2b-jpn-it-q4f16_1-MLC";

        const engineInstance = await CreateEngine(LOCAL_LLM, {
            initProgressCallback: (progress: { text: string }) => {
                store.value.status = progress.text;
            },
            wasmUrlInWorker: Wasm_URL_Base + "webllm/webllm.wasm",
            wasmUrl: Wasm_URL_Base + "webllm/webllm.wasm",
        });

        // 🚨 【ここが修正点】 🚨
        // store.value.engine = engineInstance; // ← これをやめる（Proxy化されるから）
        setGlobalEngine(engineInstance);      // ← 生のオブジェクトとして変数に保存
        
        store.value.status = "モデル準備完了";
        store.value.isReady = true;
        hasLLMInitialized = true;
        
    } catch (err) {
        console.error(err);
        store.value.status = "初期化エラー";
    } finally {
        store.value.isInitializing = false; 
    }
  });
});