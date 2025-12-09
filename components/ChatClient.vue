<script setup lang="ts">
import { ref, onMounted, nextTick, watch, onUnmounted } from 'vue' // 🚨 修正1: onUnmountedをインポート

// LLM Composableをインポート (useLocalLLM.tsで修正したdisposeEngineが含まれている前提)
const llmComposable = useLocalLLM()

// 必要な関数と状態を抽出
const initialize = llmComposable.initialize
const generateStream = llmComposable.generateStream
const disposeEngine = llmComposable.disposeEngine // 🚨 修正2: disposeEngineをインポート
const isReady = llmComposable.isReady
const isLoading = llmComposable.isLoading
const status = llmComposable.status

interface ChatMessage {
  role: 'user' | 'ai'
  text: string
}

const userPrompt = ref('')
const chatHistory = ref<ChatMessage[]>([])
const isGenerating = ref(false)
const chatContainer = ref<HTMLElement | null>(null)

// 🚨 修正3: WASMリソースのライフサイクル管理
onMounted(async () => {
  console.log('Chat UIが立ち上がりました。')
  await initialize()
})

// 【最重要】コンポーネントが破棄される時に必ずエンジンを解放
onUnmounted(() => {
  console.log('Chat UIがアンマウントされました。LLMエンジンを破棄します。')
  disposeEngine()
})

const scrollToBottom = () => {
  const el = chatContainer.value
  if (el) el.scrollTop = el.scrollHeight
}

// 履歴が更新されたらスクロール
watch(chatHistory, () => nextTick(scrollToBottom), { deep: true })

async function sendMessage() {
  if (!userPrompt.value.trim() || isGenerating.value || !isReady.value) return

  const prompt = userPrompt.value

  // 履歴に追加
  chatHistory.value.push({ role: 'user', text: prompt })
  userPrompt.value = ''

  const aiIndex = chatHistory.value.length
  chatHistory.value.push({ role: 'ai', text: '' })

  isGenerating.value = true

  try {
    await generateStream(prompt, chunk => {
      // ストリーム中にUIが更新されることで、watch経由でスクロールが実行される
      chatHistory.value[aiIndex]!.text += chunk
    })
  } catch (e) {
    console.error('[Chat Error]', e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    
    // 🚨 修正4: エラー発生時の視認性を向上
    chatHistory.value[aiIndex]!.text += `\n\n--- ⚠️ エラー発生 ---\n\n${errorMessage}`
  }

  isGenerating.value = false
}
</script>

<template>
  <v-container fluid class="d-flex flex-column h-100">
    <v-row>
      <v-col cols="12">
        <v-alert
          :type="isReady ? 'success' : isLoading ? 'warning' : 'info'"
          density="compact"
          variant="tonal"
        >
          {{ status }}
        </v-alert>
      </v-col>
    </v-row>

    <v-row class="flex-grow-1">
      <v-col cols="12" class="d-flex flex-column pa-0">
        <v-card flat class="pa-4 flex-grow-1 overflow-y-auto" ref="chatContainer">
          <div v-for="(m, i) in chatHistory" :key="i" class="mb-4">
            <v-chip 
              :color="m.role === 'user' ? 'blue-grey' : 'light-green'" 
              :variant="m.role === 'user' ? 'tonal' : 'flat'"
              size="small"
              class="font-weight-bold"
            >
              {{ m.role === 'user' ? '👤 You' : '🤖 AI' }}
            </v-chip>

            <p class="ml-2 mt-2 text-body-1 whitespace-pre-wrap">{{ m.text }}</p>

            <v-progress-circular 
              v-if="m.role === 'ai' && isGenerating && !m.text.trim()" 
              indeterminate 
              size="20" 
              color="primary"
              class="ml-2 mt-2"
            />
            
            <v-divider v-if="i < chatHistory.length - 1" class="mt-4" />
          </div>
          <div v-if="chatHistory.length === 0" class="text-center text-medium-emphasis mt-10">
            LLMの準備が完了したら、チャットを開始できます。
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-text-field
          v-model="userPrompt"
          label="プロンプトを入力..."
          variant="filled"
          :disabled="isGenerating || !isReady"
          @keydown.enter="sendMessage"
          hide-details
        >
          <template #append-inner>
            <v-btn 
              :disabled="isGenerating || !isReady || !userPrompt.trim()" 
              icon="mdi-send" 
              color="primary"
              variant="flat"
              @click="sendMessage" 
            />
          </template>
        </v-text-field>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* スクロールバーのスタイルを調整したい場合はここに追加 */
.whitespace-pre-wrap {
  white-space: pre-wrap;
}

/* 全体の高さをビューポートに合わせる */
.h-100 {
  height: 100vh;
}
</style>