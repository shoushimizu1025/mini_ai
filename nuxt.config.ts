import compression from 'vite-plugin-compression'

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
    
    resolve: {
        alias: {
            // ★【最優先】DuckDB Wasmのインポートをブラウザ版に強制エイリアス
            
            // Node.jsのコアモジュールをスタブ化
            'worker_threads': 'worker-threads-stub', 
            'fs': 'fs-stub',
            'url': 'url-stub',
            
            // ONNX Runtime の問題を解決
            'onnxruntime-node': 'onnxruntime-web', 
        }
    },
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      }
    },
    assetsInclude: [
      '**/*.wasm', 
      '**/*.json'
    ],
    optimizeDeps: {
      exclude: [
        '@mlc-ai/web-llm', 
        '@duckdb/duckdb-wasm' 
      ] 
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
      assetsInlineLimit: 0, 
      rollupOptions: {
        // 全てのNode.jsネイティブ依存を外部化（バンドルから除外）
        external: [
          '@mlc-ai/web-llm', 
          'worker_threads', 
          'url',
          'fs',
          'onnxruntime-node', 
          'better-sqlite3' // veqlite経由の依存を排除
        ], 
        output: {
          manualChunks: (id) => {
            if (id.includes('@mlc-ai/web-llm')) {
              return 'web-llm-vendor';
            }
            if (id.includes('@duckdb/duckdb-wasm')) {
              return 'duckdb-wasm-vendor';
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
        { "src": "64-2.png", "sizes": "64x64", "type": "image/png" },
        { "src": "192-2.png", "sizes": "192x192", "type": "image/png" },
        { "src": "icon-2.png", "sizes": "512x512", "type": "image/png" },
        { "src": "icon-2.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
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