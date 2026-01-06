<script setup>
import { useRouter } from "vue-router";

const router = useRouter();

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push({ name: "personas" });
}
</script>

<template>
  <div class="container">
    <button class="link" type="button" @click="goBack">← Volver</button>
    <div class="card">
      <h1 style="margin: 0">Acción eliminada</h1>
      <p class="muted" style="margin: 8px 0 0">
        Ya no se crean “personas” manualmente. Primero crea el usuario y luego
        registra aportes seleccionando ese usuario.
      </p>
    </div>
  </div>
</template>
