<script setup lang="ts">
// ここでは何もインポートしない。
</script>

<template>
  <v-container fluid class="pa-4 fill-height">
    <v-row no-gutters class="flex-column">
      
      <ClientOnly fallback-tag="div">
        
        <ChatClient />

        <template #fallback>
            <v-col cols="12" class="text-center py-16">
                <v-progress-circular indeterminate color="primary" class="mb-3" />
                <v-alert type="info" density="compact">
                    AIチャット機能のロード中... (クライアント側で初期化を開始します)
                </v-alert>
            </v-col>
        </template>
      </ClientOnly>

    </v-row>
  </v-container>
</template>

<style>
/* グローバルなスタイルはここに残す */
html, body, #__nuxt, #__nuxt > div {
  height: 100%;
}
.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>