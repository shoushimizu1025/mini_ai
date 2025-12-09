// shims.d.ts

// 🚨 修正: globalThis の定義を拡張する
declare global {
  interface Global {
    ort: OrtConfig | undefined;
  }
  
  // Node.js環境とブラウザ環境の両方をカバーするために globalThis も拡張
  // これにより、globalThis.ort へのアクセスが可能になる
  var ort: OrtConfig | undefined;
}

// ONNX Runtime のグローバル設定インターフェースを定義
interface OrtConfig {
  webassemblyPath: string;
  workerPath: string;
}

// モジュールとして機能させるためのエクスポートは不要になることが多いですが、念のため残す
export {};