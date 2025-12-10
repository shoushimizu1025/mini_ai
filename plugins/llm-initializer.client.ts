// plugins/llm-initializer.client.ts

import { defineNuxtPlugin } from '#app';
// setGlobalEngine をインポートに追加
import { useLLMGlobalStore, setGlobalEngine } from '~/composables/useLocalLLM'; 
// 🚨 パッケージ管理へ移行 (@mlc-ai/web-llm を npm install している前提)
import * as webllm from '@mlc-ai/web-llm'; 

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
    
    // 以前のCDNからの動的インポートは削除し、直接インポートを使用
    const webllmFunctions = webllm.default || webllm;
    const CreateEngine = webllmFunctions.CreateWebWorkerEngine || webllmFunctions.CreateMLCEngine;

    try {
        store.value.status = "エンジン初期化中...";
        
        // --- 🤖 LLMモデル定義と学習用メモ（保持） ---
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
        // 日本語特化で安定していた: gemma-2-2b-jpn-it-q4f16_1-MLC
        const LOCAL_LLM = "gemma-2-2b-jpn-it-q4f16_1-MLC";
        // ---------------------------------------------

        // 以前の Wasm_URL_Base の定義（CDN用）はパッケージ移行のため削除
        
        const engineInstance = await CreateEngine(LOCAL_LLM, {
            initProgressCallback: (progress: { text: string }) => {
                store.value.status = progress.text;
            },
            // WASMファイルのパスは、パッケージインストール後はWebLLM側が自動で解決するため、
            // wasmUrlInWorker / wasmUrl の指定は削除しました。
        });

        // 🚨 【ここが修正点】 🚨
        // store.value.engine = engineInstance; // ← これをやめる（Proxy化されるから）
        // 型情報を指定し、生のオブジェクトとして変数に保存
        setGlobalEngine(engineInstance as webllm.ChatModule);      
        
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