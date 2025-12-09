// composables/useLocalLLM.ts
import { computed } from "vue"; 
import { useState } from "#app"; 

// 🚨 変更点1: エンジン本体はリアクティブ管理外の「ただの変数」にする
// これにより、VueのProxy化(ラップ)を回避し、WASMとのBindingErrorを防ぐ
let _globalEngineInstance: any = null;

// ストアは「状態（フラグやテキスト）」だけを管理する
interface LLMStore {
    // engine: any; // 削除
    isInitializing: boolean;
    isReady: boolean;
    status: string;
}

export const useLLMGlobalStore = () => useState<LLMStore>('llmStore', () => ({
    // engine: null, // 削除
    isInitializing: false,
    isReady: false,
    status: "未初期化",
}));

// 外部（プラグイン）からエンジンをセットするためのセッター関数をエクスポート
export const setGlobalEngine = (instance: any) => {
    _globalEngineInstance = instance;
};

// 外部からエンジンを取得するためのゲッター（直接参照用）
export const getGlobalEngine = () => {
    return _globalEngineInstance;
};


export default function useLocalLLM() {
  
  const store = useLLMGlobalStore();
  
  const initialize = () => {
    console.warn("初期化はPluginで行われます。");
  };

  const disposeEngine = async () => {
    // リアクティブ変数ではなく、グローバル変数を参照
    const engine = _globalEngineInstance; 
    
    if (engine && typeof engine.dispose === 'function') {
        try {
            store.value.status = "エンジンを破棄中...";
            await engine.dispose(); 
            
            // 変数をnullに戻す
            _globalEngineInstance = null;
            
            store.value.isReady = false;
            store.value.isInitializing = false;
            store.value.status = "エンジンは正常に破棄されました。";
            console.log("[WebLLM] Engine disposed successfully.");
        } catch (e) {
            console.error("[WebLLM] 破棄エラー:", e);
        }
    }
  };

  const resetChat = async () => {
      console.warn("[WebLLM Reset] 強制リセット");
      await disposeEngine(); 
      store.value.isReady = false;
      store.value.status = "リセット完了。リロードしてください。"; 
  };

  const generateStream = async (prompt: string, onChunk: (t: string) => void) => {
    // リアクティブ変数ではなく、グローバル変数を参照
    const engine = _globalEngineInstance; 
    
    if (!engine) {
        throw new Error("Engine が存在しません。");
    }

    try {
      console.log("[WebLLM] Generating stream...", prompt);
      
      const stream = await engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        stream: true, 
        temperature: 0.7,
        max_tokens: 512,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
            onChunk(content);
        }
      }

    } catch (err) {
      console.error("[WebLLM Generation Error]", err);
      throw err;
    }
  };

  return {
    initialize, 
    generateStream,
    resetChat,
    disposeEngine,
    // ストアの状態だけを返す
    isReady: computed(() => store.value.isReady),
    isLoading: computed(() => store.value.isInitializing),
    status: computed(() => store.value.status),
  };
}