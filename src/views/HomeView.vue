<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { clampPercent, formatCLP } from "@/lib/money.js";
import {
  downloadCsv,
  exportPersonasSummaryCsv,
  fetchAportesYearBounds,
  fetchAportesByRange,
  fetchMetaOverridesForYear,
  fetchPersonas,
  getYearRange,
  SAVINGS_TOTAL,
  sumAportes,
  sumMeta,
  toFriendlyError,
  totalsByPersona,
} from "@/lib/data.js";

const router = useRouter();

const selectedYear = ref(new Date().getFullYear());
const yearOptions = ref([]);
const q = ref("");

const loading = ref(true);
const error = ref(null);
const personas = ref([]);
const aportes = ref([]);
const totalesPorPersona = ref({});
const metaOverrides = ref(new Map());

const range = computed(() => getYearRange(selectedYear.value));

function buildYearOptions(minYear, maxYear) {
  const opts = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    opts.push({ value: y, label: String(y) });
  }
  return opts;
}

async function loadYearOptions() {
  const current = new Date().getFullYear();
  try {
    const bounds = await fetchAportesYearBounds();
    const min = bounds.minYear ?? current;
    const max = current;
    yearOptions.value = buildYearOptions(min, max);
  } catch {
    yearOptions.value = buildYearOptions(current, current);
  }
  if (!yearOptions.value.some((o) => o.value === selectedYear.value)) {
    selectedYear.value = current;
  }
}

const filteredPersonas = computed(() => {
  const query = q.value.trim().toLowerCase();
  if (!query) return personas.value;
  return personas.value.filter((p) =>
    String(p.nombre ?? "")
      .toLowerCase()
      .includes(query)
  );
});

const rows = computed(() => {
  return filteredPersonas.value.map((p) => {
    const meta = metaOverrides.value.get(p.id) ?? SAVINGS_TOTAL;
    const total = totalesPorPersona.value[p.id] ?? 0;
    const percent = clampPercent((total / (meta || 1)) * 100);
    return { persona: p, meta, total, percent };
  });
});

const totalAportado = computed(() => sumAportes(aportes.value));
const metaTotal = computed(() => sumMeta(personas.value, metaOverrides.value));
const restanteTotal = computed(() =>
  Math.max(0, metaTotal.value - totalAportado.value)
);
const avanceTotal = computed(() =>
  clampPercent((totalAportado.value / (metaTotal.value || 1)) * 100)
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [ps, ao, mo] = await Promise.all([
      fetchPersonas(),
      fetchAportesByRange({ start: range.value.start, end: range.value.end }),
      fetchMetaOverridesForYear(range.value.year),
    ]);
    personas.value = ps;
    aportes.value = ao;
    metaOverrides.value = mo;
    totalesPorPersona.value = totalsByPersona(ao);
  } catch (e) {
    error.value = toFriendlyError(e, "No se pudieron cargar los datos.");
  } finally {
    loading.value = false;
  }
}

function goToPerson(id) {
  router.push({
    name: "person",
    params: { id },
    query: { year: String(range.value.year) },
  });
}

function onExport() {
  const rows = exportPersonasSummaryCsv({
    year: range.value.year,
    personas: personas.value,
    aportesTotals: totalesPorPersona.value,
    metaOverridesMap: metaOverrides.value,
  });
  downloadCsv(`personas-${range.value.year}.csv`, rows);
}

watch(selectedYear, load);
onMounted(async () => {
  await loadYearOptions();
  await load();
});
</script>

<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Personas</h1>
        <div class="muted">Año {{ range.year }}</div>
      </div>
      <div class="row gap">
        <label class="field" style="margin: 0; min-width: 160px">
          <span class="muted" style="font-size: 0.85rem">Año</span>
          <Multiselect
            v-model="selectedYear"
            :options="yearOptions"
            valueProp="value"
            label="label"
            :canClear="false"
            :searchable="true"
          />
        </label>

        <button
          class="button secondary"
          type="button"
          @click="onExport"
          :disabled="loading"
        >
          Exportar CSV
        </button>
        <RouterLink class="button secondary" to="/persona/nueva"
          >Nueva persona</RouterLink
        >
        <RouterLink class="button" to="/aporte">Registrar aporte</RouterLink>
      </div>
    </div>

    <div class="row" style="margin-bottom: 12px; gap: 12px; flex-wrap: wrap">
      <label class="field" style="margin: 0; flex: 1; min-width: 240px">
        <span class="muted" style="font-size: 0.85rem">Buscar persona</span>
        <input
          v-model.trim="q"
          type="text"
          placeholder="Ej: Juan"
          autocomplete="off"
        />
      </label>
    </div>

    <div
      v-if="!loading && !error"
      class="stats-grid"
      style="margin-bottom: 12px"
    >
      <div class="stat-card">
        <div class="stat-label">Total aportado</div>
        <div class="stat-value">{{ formatCLP(totalAportado) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Meta total</div>
        <div class="stat-value">{{ formatCLP(metaTotal) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Restante</div>
        <div class="stat-value">{{ formatCLP(restanteTotal) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avance familiar</div>
        <div class="stat-value">{{ avanceTotal.toFixed(1) }}%</div>
        <progress :value="avanceTotal" max="100" class="progress" />
      </div>
    </div>

    <p v-if="loading" class="muted">Cargando…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else class="stack">
      <p v-if="rows.length === 0" class="muted">
        Aún no hay personas registradas.
      </p>

      <div
        v-for="r in rows"
        :key="r.persona.id"
        class="card clickable"
        role="button"
        tabindex="0"
        @click="goToPerson(r.persona.id)"
        @keyup.enter="goToPerson(r.persona.id)"
      >
        <div class="row">
          <h2 class="h2">{{ r.persona.nombre }}</h2>
          <span class="muted">Meta: {{ formatCLP(r.meta) }}</span>
        </div>

        <div class="row">
          <strong>Total: {{ formatCLP(r.total) }}</strong>
          <span class="muted">{{ r.percent.toFixed(1) }}%</span>
        </div>

        <progress :value="r.percent" max="100" class="progress" />
      </div>
    </div>
  </div>
</template>
