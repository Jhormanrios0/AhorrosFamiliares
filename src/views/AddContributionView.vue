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

const users = ref([]);
const userOptions = ref([]);
// UI selects an Auth user. We map to persona_id internally for aportes FK.
const selectedUserId = ref("");
const valor = ref(null);
const fecha = ref(null);

const planOptions = ref([]);
const userToPersonaId = ref(new Map());
const userFrequencyMap = ref(new Map());
const paidDatesSet = ref(new Set());
const paidDatesLoading = ref(false);
let rebuildSeq = 0;

function planLabel(opt) {
  return `${opt.date} — ${formatCLP(opt.amount)}`;
}

const selectedPersonaId = computed(
  () => userToPersonaId.value.get(selectedUserId.value) ?? null
);

const selectedFrequency = computed(() =>
  normalizeFrequency(userFrequencyMap.value.get(selectedUserId.value))
);

const noAvailableDates = computed(
  () => Boolean(selectedUserId.value) && planOptions.value.length === 0
);

async function loadPaidDatesForPersonaYear({ personaId, year }) {
  if (!personaId) return new Set();

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  paidDatesLoading.value = true;
  try {
    const { data, error } = await supabase
      .from("aportes")
      .select("fecha")
      .eq("persona_id", personaId)
      .gte("fecha", from)
      .lte("fecha", to);
    if (error) throw error;

    const set = new Set();
    for (const row of data ?? []) {
      if (row?.fecha) set.add(String(row.fecha).slice(0, 10));
    }
    return set;
  } finally {
    paidDatesLoading.value = false;
  }
}

async function rebuildPlanForSelected() {
  const seq = ++rebuildSeq;
  const year = selectedYear.value;
  const freq = selectedFrequency.value;
  const personaId = selectedPersonaId.value;

  if (!selectedUserId.value) {
    planOptions.value = [];
    fecha.value = null;
    valor.value = null;
    paidDatesSet.value = new Set();
    return;
  }

  try {
    const paid = await loadPaidDatesForPersonaYear({ personaId, year });
    if (seq !== rebuildSeq) return;
    paidDatesSet.value = paid;
  } catch (e) {
    if (seq !== rebuildSeq) return;
    // Non-fatal: keep showing all dates if paid-date load fails.
    paidDatesSet.value = new Set();
  }

  const plan = buildSavingsPlan({
    year,
    frequency: freq,
    total: SAVINGS_TOTAL,
  });

  const unpaidPlan = plan.filter((p) => !paidDatesSet.value.has(p.date));
  planOptions.value = unpaidPlan.map((p) => ({
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

async function loadUsers() {
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

    const preselectUserId =
      typeof route.query.userId === "string" ? route.query.userId : "";
    const preselectPersonaId =
      typeof route.query.personaId === "string" ? route.query.personaId : "";

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sesión no válida.");

    const res = await fetch("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(payload?.error || "No se pudieron cargar usuarios.");

    users.value = Array.isArray(payload?.users) ? payload.users : [];
    // Only show users that have a linked persona (needed for aportes FK).
    users.value = users.value.filter((u) => Boolean(u?.persona_id));

    userOptions.value = users.value.map((u) => ({
      value: u.user_id,
      label: `${u.nombre || u.email || "(sin nombre)"}${
        u.email ? ` — ${u.email}` : ""
      } — ${normalizeFrequency(u.frecuencia)}`,
    }));

    userToPersonaId.value = new Map(
      users.value.map((u) => [u.user_id, u.persona_id])
    );
    userFrequencyMap.value = new Map(
      users.value.map((u) => [u.user_id, normalizeFrequency(u.frecuencia)])
    );

    if (users.value.length === 0) {
      selectedUserId.value = "";
      planOptions.value = [];
      fecha.value = null;
      valor.value = null;
      pageError.value = "Aún no hay usuarios creados para registrar aportes.";
      return;
    }

    if (preselectUserId) {
      selectedUserId.value = preselectUserId;
    } else if (preselectPersonaId) {
      const found = users.value.find(
        (u) => u.persona_id === preselectPersonaId
      );
      selectedUserId.value = found?.user_id ?? "";
    } else if (!selectedUserId.value && users.value.length > 0) {
      selectedUserId.value = users.value[0].user_id;
    }

    rebuildPlanForSelected();
  } catch (e) {
    pageError.value = e?.message ?? "No se pudieron cargar los usuarios.";
  } finally {
    loading.value = false;
  }
}

async function onSubmit() {
  formError.value = null;
  if (!selectedUserId.value) {
    formError.value = "Selecciona un usuario.";
    return;
  }
  if (!selectedPersonaId.value) {
    formError.value =
      "Este usuario no tiene persona asociada para registrar aportes.";
    return;
  }
  if (!fecha.value) {
    formError.value = "Selecciona una fecha.";
    return;
  }

  if (paidDatesSet.value.has(fecha.value)) {
    formError.value = "Esa fecha ya tiene un aporte registrado.";
    return;
  }

  const freq = normalizeFrequency(
    userFrequencyMap.value.get(selectedUserId.value)
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
      persona_id: selectedPersonaId.value,
      valor: expected,
      fecha: fecha.value,
    });
    if (insertError) throw insertError;

    await router.push({
      name: "person",
      params: { id: selectedPersonaId.value },
      query: { year: String(selectedYear.value) },
    });
  } catch (e) {
    formError.value = e?.message ?? "No se pudo guardar el aporte.";
  } finally {
    saving.value = false;
  }
}

onMounted(loadUsers);

watch(selectedUserId, () => {
  void rebuildPlanForSelected();
});

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
            <span>Usuario</span>
            <Multiselect
              v-model="selectedUserId"
              :options="userOptions"
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
            <small v-if="paidDatesLoading" class="muted"
              >Cargando fechas…</small
            >
            <small v-else-if="noAvailableDates" class="muted"
              >Ya están registradas todas las fechas del plan para este
              año.</small
            >
            <small v-else class="muted">Selecciona una fecha del plan</small>
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
          <button
            class="button"
            type="submit"
            :disabled="saving || paidDatesLoading || !fecha || noAvailableDates"
          >
            {{ saving ? "Guardando…" : "Guardar" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
