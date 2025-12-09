import compression from 'vite-plugin-compression'
// pathモジュールは不要になりました

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  sourcemap: false,

  app: {
    head: {
      htmlAttrs: {
        lang: 'ja',
      },
      meta: [
        { charset: 'utf-8' },
        { name: "theme-color", content: "#000000" },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', href: `/favicon.ico`, sizes: "32x32" },
        { rel: 'apple-touch-icon', href: `/apple-touch-icon-180x180-2.png` }, 
      ],
      script: []
    },
  },

  modules: [
    '@vite-pwa/nuxt'
  ],

  css: [
    'vuetify/lib/styles/main.sass',
    "@mdi/font/css/materialdesignicons.css",
  ],

  build: {
    transpile: [
      'vuetify',
    ],
  },

  experimental: {
    componentIslands: true
  },

  nitro: {
    compressPublicAssets: true,
    routeRules: {
      '/**': {
        headers: {
          // 本番ビルド環境用ヘッダー
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
    },
  },

  vite: {
    worker: {
      format: "es"
    },
    // 【維持】モジュール解決のエイリアスは削除されました
    
    // 【✅ Wasm競合回避】Vite開発サーバーのヘッダーをフックで強制上書き
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      }
    },
    // Wasmファイルの静的アセット処理を指示
    assetsInclude: [
      '**/*.wasm', 
      '**/*.json'
    ],
    // 開発時の依存関係の最適化から除外
    optimizeDeps: {
      exclude: ['@mlc-ai/web-llm']
    },
    plugins: [
      compression({
        algorithm: 'brotliCompress', 
        ext: '.br', 
      }),
      compression({
        algorithm: 'gzip',
        ext: '.gz', 
      }),
    ],
    build: {
      cssCodeSplit: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
        },
      },
      // Wasmファイルをインライン化せず、純粋なURLとして扱う
      assetsInlineLimit: 0, 
      rollupOptions: {
        // 全てのバンドルから除外
        external: ['@mlc-ai/web-llm'],
        output: {
          manualChunks: (id) => {
            // WebLLMのファイルを独自のチャンクに隔離し、メインバンドルへの注入を防ぐ
            if (id.includes('@mlc-ai/web-llm')) {
              return 'web-llm-vendor';
            }
          }
        }
      }
    }
  },

  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: 'DollRoom',
      description: "Simple MMD model viewer",
      theme_color: "#000000",
      lang: "ja",
      short_name: "DollRoom",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      icons: [
        {
          "src": "64-2.png",
          "sizes": "64x64",
          "type": "image/png"
        },
        {
          "src": "192-2.png",
          "sizes": "192x192",
          "type": "image/png"
        },
        {
          "src": "icon-2.png",
          "sizes": "512x512",
          "type": "image/png"
        },
        {
          "src": "icon-2.png",
          "sizes": "512x512",
          "type": "image/png",
          "purpose": "maskable"
        }
      ],
    },
    workbox: {
      navigateFallback: null
    },
    devOptions: {
      enabled: false,
      type: "module"
    },
  },

  devtools: { enabled: true },
  compatibilityDate: "2024-08-01",
})