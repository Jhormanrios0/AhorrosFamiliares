<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabaseClient.js";
import { formatCLP } from "@/lib/money.js";
import { getMyRole } from "@/lib/account.js";
import {
  buildSavingsPlan,
  expectedAmountForDate,
  isAllowedContributionDate,
  normalizeFrequency,
  SAVINGS_TOTAL,
} from "@/lib/data.js";

const router = useRouter();
const route = useRoute();

const loading = ref(true);
const saving = ref(false);
const pageError = ref(null);
const formError = ref(null);
const forbidden = ref(false);

const selectedYear = ref(new Date().getFullYear());

const personas = ref([]);
const personaOptions = ref([]);
const personaId = ref("");
const valor = ref(null);
const fecha = ref(null);

const planOptions = ref([]);
const personaFrequencyMap = ref(new Map());

function planLabel(opt) {
  return `${opt.date} — ${formatCLP(opt.amount)}`;
}

const selectedFrequency = computed(() =>
  normalizeFrequency(personaFrequencyMap.value.get(personaId.value))
);

function rebuildPlanForSelected() {
  const year = selectedYear.value;
  const freq = selectedFrequency.value;

  if (!personaId.value) {
    planOptions.value = [];
    fecha.value = null;
    valor.value = null;
    return;
  }

  const plan = buildSavingsPlan({
    year,
    frequency: freq,
    total: SAVINGS_TOTAL,
  });
  planOptions.value = plan.map((p) => ({
    value: p.date,
    label: planLabel(p),
    date: p.date,
    amount: p.amount,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const hasToday = planOptions.value.some((p) => p.value === today);
  fecha.value = hasToday ? today : planOptions.value[0]?.value ?? null;
  if (fecha.value) {
    valor.value = expectedAmountForDate({
      year,
      frequency: freq,
      date: fecha.value,
      total: SAVINGS_TOTAL,
    });
  }
}

async function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  await router.push({ name: "personas" });
}

async function loadPeople() {
  loading.value = true;
  pageError.value = null;
  formError.value = null;
  forbidden.value = false;
  try {
    const role = await getMyRole();
    if (role !== "admin") {
      forbidden.value = true;
      pageError.value = "Solo el admin puede registrar aportes.";
      return;
    }

    const yq = route.query?.year;
    const y = Number(Array.isArray(yq) ? yq[0] : yq);
    selectedYear.value = Number.isFinite(y) ? y : new Date().getFullYear();

    const preselect =
      typeof route.query.personaId === "string" ? route.query.personaId : "";

    const { data, error: peopleError } = await supabase
      .from("personas")
      .select("id,nombre,meta_anual,frecuencia")
      .order("fecha_registro", { ascending: true });
    if (peopleError) {
      // Fallback if DB hasn't been migrated yet (missing column)
      const { data: d2, error: e2 } = await supabase
        .from("personas")
        .select("id,nombre,meta_anual")
        .order("fecha_registro", { ascending: true });
      if (e2) throw e2;
      personas.value = (d2 ?? []).map((p) => ({ ...p, frecuencia: "mensual" }));
    } else {
      personas.value = (data ?? []).map((p) => ({
        ...p,
        frecuencia: normalizeFrequency(p.frecuencia),
      }));
    }

    personaOptions.value = personas.value.map((p) => ({
      value: p.id,
      label: `${p.nombre} — ${normalizeFrequency(p.frecuencia)}`,
    }));

    personaFrequencyMap.value = new Map(
      personas.value.map((p) => [p.id, normalizeFrequency(p.frecuencia)])
    );

    if (preselect) {
      personaId.value = preselect;
    } else if (!personaId.value && personas.value.length > 0) {
      personaId.value = personas.value[0].id;
    }

    rebuildPlanForSelected();
  } catch (e) {
    pageError.value = e?.message ?? "No se pudieron cargar las personas.";
  } finally {
    loading.value = false;
  }
}

async function onSubmit() {
  formError.value = null;
  if (!personaId.value) {
    formError.value = "Selecciona una persona.";
    return;
  }
  if (!fecha.value) {
    formError.value = "Selecciona una fecha.";
    return;
  }

  const freq = normalizeFrequency(
    personaFrequencyMap.value.get(personaId.value)
  );
  if (
    !isAllowedContributionDate({
      year: selectedYear.value,
      frequency: freq,
      date: fecha.value,
    })
  ) {
    formError.value = "La fecha seleccionada no es válida para la frecuencia.";
    return;
  }

  const expected = expectedAmountForDate({
    year: selectedYear.value,
    frequency: freq,
    date: fecha.value,
    total: SAVINGS_TOTAL,
  });
  if (!expected) {
    formError.value = "No se pudo calcular el monto para esa fecha.";
    return;
  }
  valor.value = expected;

  saving.value = true;
  try {
    const { error: insertError } = await supabase.from("aportes").insert({
      persona_id: personaId.value,
      valor: expected,
      fecha: fecha.value,
    });
    if (insertError) throw insertError;

    await router.push({
      name: "person",
      params: { id: personaId.value },
      query: { year: String(selectedYear.value) },
    });
  } catch (e) {
    formError.value = e?.message ?? "No se pudo guardar el aporte.";
  } finally {
    saving.value = false;
  }
}

onMounted(loadPeople);

watch(personaId, rebuildPlanForSelected);

watch(fecha, () => {
  if (!fecha.value) return;
  const expected = expectedAmountForDate({
    year: selectedYear.value,
    frequency: selectedFrequency.value,
    date: fecha.value,
    total: SAVINGS_TOTAL,
  });
  valor.value = expected ?? null;
});
</script>

<template>
  <div class="container">
    <div class="page-header">
      <div>
        <button class="link" type="button" @click="goBack">← Volver</button>
        <h1>Registrar aporte</h1>
        <div class="muted">Año {{ selectedYear }}</div>
      </div>
    </div>

    <p v-if="loading" class="muted">Cargando…</p>

    <div v-else class="stack">
      <div v-if="pageError" class="alert error">
        <div class="alert-title">Error</div>
        <div>{{ pageError }}</div>
      </div>

      <form
        v-if="!forbidden"
        class="card contrib-form"
        @submit.prevent="onSubmit"
      >
        <div v-if="formError" class="alert error" style="margin-bottom: 12px">
          <div class="alert-title">Revisa el formulario</div>
          <div>{{ formError }}</div>
        </div>

        <div class="contrib-grid">
          <label class="field">
            <span>Persona</span>
            <Multiselect
              v-model="personaId"
              :options="personaOptions"
              valueProp="value"
              label="label"
              :canClear="false"
              :searchable="true"
            />
            <small class="muted"
              >Frecuencia: {{ selectedFrequency || "mensual" }}</small
            >
          </label>

          <label class="field">
            <span>Fecha programada</span>
            <Multiselect
              v-model="fecha"
              :options="planOptions"
              valueProp="value"
              label="label"
              :canClear="false"
              :searchable="true"
            />
            <small class="muted">Selecciona una fecha del plan</small>
          </label>
        </div>

        <label class="field">
          <span>Monto (fijo)</span>
          <input
            :value="valor ? formatCLP(valor) : ''"
            type="text"
            readonly
            disabled
          />
          <small class="muted">Meta fija: {{ formatCLP(SAVINGS_TOTAL) }}</small>
        </label>

        <div class="contrib-actions">
          <button class="button" type="submit" :disabled="saving">
            {{ saving ? "Guardando…" : "Guardar" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
