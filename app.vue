<template>
  <div>
    <v-app>
      <NuxtPwaManifest />
      <NuxtPage />
    </v-app>
  </div>
</template>

<style>
body {
  padding: 0 !important;
}
html, body {
  overscroll-behavior: none;
}
.v-btn {
  text-transform: none;
}
.v-card--variant-outlined {
  border: thin solid #444;
}
.v-theme--light .v-card--variant-outlined {
  border: thin solid #d8d8d8;
}
</style>
