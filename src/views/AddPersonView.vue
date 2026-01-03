<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabaseClient.js";
import { formatCLP } from "@/lib/money.js";

const router = useRouter();

const nombre = ref("");
const frecuencia = ref("mensual");
const META_FIJA = 1100000;

const saving = ref(false);
const error = ref(null);

const freqOptions = [
  { value: "mensual", label: "Mensual (04 de cada mes)" },
  { value: "quincenal", label: "Quincenal (05 y 20)" },
];

async function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  await router.push({ name: "personas" });
}

async function onSubmit() {
  error.value = null;

  if (!nombre.value.trim()) {
    error.value = "Ingresa un nombre.";
    return;
  }
  saving.value = true;
  try {
    const { data, error: insertError } = await supabase
      .from("personas")
      .insert({
        nombre: nombre.value.trim(),
        meta_anual: META_FIJA,
        frecuencia: frecuencia.value,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    await router.push({ name: "person", params: { id: data.id } });
  } catch (e) {
    error.value = e?.message ?? "No se pudo guardar la persona.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="container">
    <button class="link" type="button" @click="goBack">← Volver</button>

    <h1>Nueva persona</h1>

    <form class="card" @submit.prevent="onSubmit">
      <label class="field">
        <span>Nombre</span>
        <input v-model.trim="nombre" type="text" autocomplete="off" required />
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

        <small class="muted">
          Meta fija: {{ formatCLP(META_FIJA) }} (enero a noviembre)
        </small>
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button class="button" type="submit" :disabled="saving">
        {{ saving ? "Guardando…" : "Guardar" }}
      </button>
    </form>
  </div>
</template>
