<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabaseClient.js";

const router = useRouter();

const email = ref("");
const password = ref("");
const nombre = ref("");
const frecuencia = ref("mensual");

const loading = ref(false);
const error = ref(null);
const success = ref(null);

const freqOptions = [
  { value: "mensual", label: "Mensual (05 de cada mes)" },
  { value: "quincenal", label: "Quincenal (05 y 20)" },
];

const canSubmit = computed(() => {
  return (
    email.value.trim() &&
    password.value &&
    password.value.length >= 6 &&
    nombre.value.trim()
  );
});

async function onSubmit() {
  error.value = null;
  success.value = null;
  loading.value = true;

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      error.value = "Sesión no válida. Vuelve a iniciar sesión.";
      return;
    }

    const res = await fetch("/api/create-member", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        nombre: nombre.value.trim(),
        frecuencia: frecuencia.value,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      error.value = payload?.error || "No se pudo crear el usuario.";
      return;
    }

    success.value = "Usuario creado (member) correctamente.";
    await router.push({ name: "users" });
  } catch (e) {
    error.value =
      e?.message ??
      "No se pudo crear el usuario. Si estás en local, este endpoint existe cuando despliegas en Vercel.";
  } finally {
    loading.value = false;
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push({ name: "users" });
}
</script>

<template>
  <div class="container">
    <div class="row">
      <div>
        <h1>Crear usuario (member)</h1>
        <div class="muted">Solo admin</div>
      </div>
      <button class="button secondary" type="button" @click="goBack">
        Volver
      </button>
    </div>

    <form class="card" @submit.prevent="onSubmit">
      <label class="field">
        <span>Nombre</span>
        <input v-model.trim="nombre" type="text" autocomplete="name" required />
      </label>

      <label class="field">
        <span>Email</span>
        <input
          v-model.trim="email"
          type="email"
          autocomplete="email"
          required
        />
      </label>

      <label class="field">
        <span>Contraseña (temporal)</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="6"
          required
        />
      </label>

      <label class="field">
        <span>Frecuencia</span>
        <Multiselect
          v-model="frecuencia"
          :options="freqOptions"
          valueProp="value"
          label="label"
          :canClear="false"
          :searchable="false"
        />

        <small class="muted">Meta fija: 1.100.000 (enero a noviembre)</small>
      </label>

      <p v-if="success" class="muted">{{ success }}</p>
      <p v-if="error" class="error">{{ error }}</p>

      <button class="button" type="submit" :disabled="loading || !canSubmit">
        {{ loading ? "Creando…" : "Crear usuario" }}
      </button>
    </form>
  </div>
</template>
