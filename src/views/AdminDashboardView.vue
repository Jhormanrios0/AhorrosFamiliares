<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { clampPercent, formatCLP } from "@/lib/money.js";
import {
  downloadCsv,
  exportPersonasSummaryCsv,
  fetchAportesYearBounds,
  fetchAportesByRange,
  fetchLatestAportes,
  fetchMetaOverridesForYear,
  fetchPersonas,
  getYearRange,
  sumAportes,
  sumMeta,
  toFriendlyError,
  totalsByPersona,
} from "@/lib/data.js";

const router = useRouter();

const selectedYear = ref(new Date().getFullYear());
const yearOptions = ref([]);
const loading = ref(true);
const error = ref(null);

const personas = ref([]);
const aportes = ref([]);
const totalesPorPersona = ref({});
const metaOverrides = ref(new Map());
const latest = ref([]);

const range = computed(() => getYearRange(selectedYear.value));
const totalAportado = computed(() => sumAportes(aportes.value));
const metaTotal = computed(() => sumMeta(personas.value, metaOverrides.value));
const restanteTotal = computed(() =>
  Math.max(0, metaTotal.value - totalAportado.value)
);
const avanceTotal = computed(() =>
  clampPercent((totalAportado.value / (metaTotal.value || 1)) * 100)
);

const tiles = computed(() => [
  {
    key: "personas",
    title: "Personas",
    description: "Recuento general y progreso anual",
    action: () => router.push({ name: "personas" }),
  },
  {
    key: "users",
    title: "Administrar usuarios",
    description: "Editar usuarios y crear nuevos",
    action: () => router.push({ name: "users" }),
  },
]);

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

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [ps, ao, mo, la] = await Promise.all([
      fetchPersonas(),
      fetchAportesByRange({ start: range.value.start, end: range.value.end }),
      fetchMetaOverridesForYear(range.value.year),
      fetchLatestAportes({
        start: range.value.start,
        end: range.value.end,
        limit: 8,
      }),
    ]);
    personas.value = ps;
    aportes.value = ao;
    metaOverrides.value = mo;
    totalesPorPersona.value = totalsByPersona(ao);
    latest.value = la;
  } catch (e) {
    error.value = toFriendlyError(e, "No se pudieron cargar los datos.");
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  const rows = exportPersonasSummaryCsv({
    year: range.value.year,
    personas: personas.value,
    aportesTotals: totalesPorPersona.value,
    metaOverridesMap: metaOverrides.value,
  });
  downloadCsv(`resumen-${range.value.year}.csv`, rows);
}

function goToPersona(id) {
  router.push({
    name: "person",
    params: { id },
    query: { year: String(range.value.year) },
  });
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
        <h1>Panel de administración</h1>
        <div class="muted">Resumen del año {{ range.year }}</div>
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
          :disabled="loading"
          @click="exportCsv"
        >
          Exportar CSV
        </button>
      </div>
    </div>

    <p v-if="loading" class="muted">Cargando…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else class="stack">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label-row">
              <span class="stat-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v10" />
                  <path d="M9.5 9.5h5" />
                  <path d="M9.5 14.5h5" />
                </svg>
              </span>
              <div class="stat-label">Total aportado</div>
            </div>
          </div>
          <div class="stat-value">{{ formatCLP(totalAportado) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label-row">
              <span class="stat-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v3" />
                  <path d="M12 18v3" />
                  <path d="M3 12h3" />
                  <path d="M18 12h3" />
                </svg>
              </span>
              <div class="stat-label">Meta total</div>
            </div>
          </div>
          <div class="stat-value">{{ formatCLP(metaTotal) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label-row">
              <span class="stat-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 4v16" />
                  <path d="M7 15l5 5 5-5" />
                </svg>
              </span>
              <div class="stat-label">Restante</div>
            </div>
          </div>
          <div class="stat-value">{{ formatCLP(restanteTotal) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-head">
            <div class="stat-label-row">
              <span class="stat-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M4 19V5" />
                  <path d="M4 19h16" />
                  <path d="M8 16v-4" />
                  <path d="M12 16v-7" />
                  <path d="M16 16v-9" />
                </svg>
              </span>
              <div class="stat-label">Avance familiar</div>
            </div>
          </div>
          <div class="stat-value">{{ avanceTotal.toFixed(1) }}%</div>
          <progress :value="avanceTotal" max="100" class="progress" />
        </div>
      </div>

      <div class="row">
        <h2 class="h2">Accesos rápidos</h2>
      </div>

      <div class="dashboard-grid">
        <button
          v-for="t in tiles"
          :key="t.title"
          type="button"
          class="tile"
          @click="t.action"
        >
          <div class="tile-head">
            <span class="tile-icon" aria-hidden="true">
              <svg
                v-if="t.key === 'personas'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="9" cy="8" r="3" />
                <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
                <circle cx="17" cy="9" r="2.5" />
                <path d="M14.5 20a5.5 5.5 0 0 1 7 0" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 3v2" />
                <path d="M12 19v2" />
                <path d="M4.2 4.2l1.4 1.4" />
                <path d="M18.4 18.4l1.4 1.4" />
                <path d="M3 12h2" />
                <path d="M19 12h2" />
                <path d="M4.2 19.8l1.4-1.4" />
                <path d="M18.4 5.6l1.4-1.4" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <span class="tile-arrow" aria-hidden="true">→</span>
          </div>
          <div class="tile-title">{{ t.title }}</div>
          <div class="tile-desc">{{ t.description }}</div>
        </button>

        <button type="button" class="tile" disabled>
          <div class="tile-head">
            <span class="tile-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <span class="tile-arrow" aria-hidden="true">→</span>
          </div>
          <div class="tile-title">Préstamos</div>
          <div class="tile-desc">Próximamente</div>
        </button>
      </div>

      <div class="row">
        <h2 class="h2">Últimos aportes</h2>
        <button class="button secondary" type="button" @click="load">
          Recargar
        </button>
      </div>

      <div v-if="latest.length === 0" class="card muted">
        No hay aportes este año.
      </div>

      <div v-else class="card">
        <table class="table table-compact">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Persona</th>
              <th class="right">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in latest" :key="a.id">
              <td>{{ a.fecha }}</td>
              <td>
                <button
                  class="link"
                  type="button"
                  @click="goToPersona(a.persona_id)"
                >
                  {{ a.persona_nombre || a.persona_id }}
                </button>
              </td>
              <td class="right">{{ formatCLP(a.valor) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
