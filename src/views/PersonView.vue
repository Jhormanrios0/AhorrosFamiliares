<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { clampPercent, formatCLP } from "@/lib/money.js";
import { getMyPersonaId, getMyRole } from "@/lib/account.js";
import {
  buildSavingsPlan,
  downloadCsv,
  exportAportesCsv,
  fetchAportesYearBounds,
  fetchAportesByRange,
  fetchMetaOverridesForYear,
  getYearRange,
  groupAportesByMonth,
  monthsLeftInYear,
  normalizeFrequency,
  SAVINGS_TOTAL,
  yearFromISODate,
  toFriendlyError,
} from "@/lib/data.js";
import { supabase } from "@/lib/supabaseClient.js";

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));

const selectedYear = ref(new Date().getFullYear());
const yearOptions = ref([]);
const range = computed(() => getYearRange(selectedYear.value));

function buildYearOptions(minYear, maxYear) {
  const opts = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    opts.push({ value: y, label: String(y) });
  }
  return opts;
}

const loading = ref(true);
const error = ref(null);
const persona = ref(null);
const aportes = ref([]);
const metaOverrides = ref(new Map());
const frecuencia = ref("mensual");

const role = ref(null);
const myPersonaId = ref(null);
const isAdmin = computed(() => role.value === "admin");

async function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  if (isAdmin.value) {
    await router.push({ name: "personas" });
    return;
  }
  if (myPersonaId.value) {
    await router.push({ name: "person", params: { id: myPersonaId.value } });
    return;
  }
  await router.push({ name: "login" });
}

const total = computed(() =>
  aportes.value.reduce((sum, a) => sum + (a.valor ?? 0), 0)
);

const metaAnual = computed(() => {
  const base = SAVINGS_TOTAL;
  const override = metaOverrides.value?.get?.(persona.value?.id);
  return override ?? base;
});

const plan = computed(() =>
  buildSavingsPlan({ year: range.value.year, frequency: frecuencia.value })
);

const percent = computed(() => {
  const meta = metaAnual.value ?? 0;
  return clampPercent((total.value / (meta || 1)) * 100);
});

const restante = computed(() =>
  Math.max(0, (metaAnual.value ?? 0) - total.value)
);
const monthsLeft = computed(() => monthsLeftInYear(range.value.year));
const sugeridoMensual = computed(() => {
  const m = monthsLeft.value || 1;
  return Math.ceil(restante.value / m);
});

const aportesPorMes = computed(() => groupAportesByMonth(aportes.value));

const aportesTotalByDate = computed(() => {
  const map = new Map();
  for (const a of aportes.value ?? []) {
    const d = String(a.fecha ?? "");
    if (!d) continue;
    map.set(d, (map.get(d) ?? 0) + (a.valor ?? 0));
  }
  return map;
});

const aportesDatesSet = computed(
  () => new Set(aportesTotalByDate.value.keys())
);

const aportesDatesByMonth = computed(() => {
  const map = new Map();
  for (const a of aportes.value ?? []) {
    const d = String(a.fecha ?? "");
    if (d.length < 7) continue;
    const key = d.slice(0, 7); // YYYY-MM
    const list = map.get(key) ?? [];
    list.push(d);
    map.set(key, list);
  }
  for (const [k, list] of map.entries()) {
    const unique = Array.from(new Set(list)).sort();
    map.set(k, unique);
  }
  return map;
});

function formatShortDate(isoDate) {
  const d = new Date(`${String(isoDate)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  try {
    return new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "short",
    }).format(d);
  } catch {
    return String(isoDate);
  }
}

function monthLabel(key) {
  // key: YYYY-MM
  const date = new Date(`${key}-01T00:00:00`);
  try {
    return new Intl.DateTimeFormat("es-CL", {
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return key;
  }
}

function syncYearFromRoute() {
  const q = route.query?.year;
  const y = Number(Array.isArray(q) ? q[0] : q);
  selectedYear.value = Number.isFinite(y) ? y : new Date().getFullYear();
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    role.value = await getMyRole();
    myPersonaId.value = await getMyPersonaId();

    const { data: personaData, error: personaError } = await supabase
      .from("personas")
      .select("id,nombre,meta_anual,fecha_registro,frecuencia")
      .eq("id", id.value)
      .maybeSingle();
    if (personaError) {
      // Fallback if DB isn't migrated (missing column)
      const { data: p2, error: e2 } = await supabase
        .from("personas")
        .select("id,nombre,meta_anual,fecha_registro")
        .eq("id", id.value)
        .maybeSingle();
      if (e2) throw e2;
      persona.value = p2;
      frecuencia.value = "mensual";
    } else {
      persona.value = personaData;
      frecuencia.value = normalizeFrequency(personaData?.frecuencia);
    }

    const current = new Date().getFullYear();
    const fallbackMin =
      yearFromISODate(persona.value?.fecha_registro) ?? current;
    try {
      const bounds = await fetchAportesYearBounds({ personaId: id.value });
      const min = bounds.minYear ?? fallbackMin;
      const max = current;
      yearOptions.value = buildYearOptions(min, max);
      if (!yearOptions.value.some((o) => o.value === selectedYear.value)) {
        selectedYear.value = max;
      }
    } catch {
      yearOptions.value = buildYearOptions(fallbackMin, current);
    }

    const [ao, mo] = await Promise.all([
      fetchAportesByRange({
        start: range.value.start,
        end: range.value.end,
        personaId: id.value,
      }),
      fetchMetaOverridesForYear(range.value.year),
    ]);
    aportes.value = ao;
    metaOverrides.value = mo;
  } catch (e) {
    error.value = toFriendlyError(e, "No se pudo cargar el detalle.");
  } finally {
    loading.value = false;
  }
}

function onYearChange() {
  const current = String(route.query?.year ?? "");
  const next = String(selectedYear.value);
  if (current === next) return;
  router.replace({
    name: "person",
    params: { id: id.value },
    query: { ...route.query, year: String(selectedYear.value) },
  });
}

function exportCsv() {
  const rows = exportAportesCsv({
    year: range.value.year,
    personaNombre: persona.value?.nombre ?? "",
    aportes: aportes.value,
  });
  const safeName = String(persona.value?.nombre ?? "persona")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("/", "-");
  downloadCsv(`aportes-${safeName}-${range.value.year}.csv`, rows);
}

watch(
  () => route.query.year,
  () => {
    syncYearFromRoute();
    load();
  }
);

watch(selectedYear, onYearChange);

watch(id, () => {
  syncYearFromRoute();
  load();
});

onMounted(load);
</script>

<template>
  <div class="container">
    <p v-if="loading" class="muted">Cargando…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else-if="persona" class="stack">
      <div class="person-hero card">
        <div class="person-hero-top">
          <button class="link" type="button" @click="goBack">← Volver</button>

          <div class="person-hero-actions">
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

            <RouterLink
              v-if="isAdmin"
              class="button"
              :to="{
                name: 'add-contribution',
                query: { personaId: id, year: String(range.year) },
              }"
              >Registrar aporte</RouterLink
            >
          </div>
        </div>

        <div class="person-hero-title">
          <div class="person-avatar" aria-hidden="true">
            {{
              String(persona.nombre ?? "?")
                .trim()
                .slice(0, 1)
                .toUpperCase()
            }}
          </div>
          <div>
            <h1>{{ persona.nombre }}</h1>
            <div class="muted">Año {{ range.year }}</div>
          </div>
        </div>

        <div class="person-kpis">
          <div class="stat-card">
            <div class="stat-label">Total aportado</div>
            <div class="stat-value">{{ formatCLP(total) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Meta anual</div>
            <div class="stat-value">{{ formatCLP(metaAnual) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Restante</div>
            <div class="stat-value">{{ formatCLP(restante) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Aporte sugerido / mes</div>
            <div class="stat-value">{{ formatCLP(sugeridoMensual) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Frecuencia</div>
            <div class="stat-value" style="text-transform: capitalize">
              {{ frecuencia }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avance</div>
            <div class="stat-value">{{ percent.toFixed(1) }}%</div>
            <progress :value="percent" max="100" class="progress" />
          </div>
        </div>
      </div>

      <div class="person-sections">
        <div class="card person-section">
          <div class="section-head">
            <h2 class="h2">Fechas programadas</h2>
            <span class="muted">Plan {{ frecuencia }}</span>
          </div>
          <div class="schedule-list">
            <div
              v-for="p in plan"
              :key="p.date"
              class="schedule-item"
              :class="{ 'is-done': aportesDatesSet.has(p.date) }"
            >
              <span class="schedule-marker" aria-hidden="true"></span>
              <div class="schedule-left">
                <div class="schedule-date">{{ formatShortDate(p.date) }}</div>
                <div class="schedule-sub">
                  <span class="schedule-iso">{{ p.date }}</span>
                  <span class="schedule-dot" aria-hidden="true">•</span>
                  <span class="schedule-idx">#{{ p.index }}</span>
                  <template v-if="aportesDatesSet.has(p.date)">
                    <span class="schedule-dot" aria-hidden="true">•</span>
                    <span class="schedule-done">Realizado</span>
                  </template>
                </div>
              </div>
              <div class="schedule-right">
                <div class="schedule-amount">{{ formatCLP(p.amount) }}</div>
                <div v-if="aportesDatesSet.has(p.date)" class="schedule-real">
                  ✓ {{ formatCLP(aportesTotalByDate.get(p.date) ?? 0) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card person-section">
          <div class="section-head">
            <h2 class="h2">Resumen por mes</h2>
            <span class="muted">{{ range.year }}</span>
          </div>

          <div v-if="aportesPorMes.length === 0" class="muted">
            Aún no hay aportes registrados.
          </div>

          <table v-else class="table table-compact">
            <thead>
              <tr>
                <th>Mes</th>
                <th class="right">Aportes</th>
                <th class="right">Total</th>
                <th>Fechas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in aportesPorMes" :key="m.key">
                <td style="text-transform: capitalize">
                  {{ monthLabel(m.key) }}
                </td>
                <td class="right">{{ m.count }}</td>
                <td class="right">{{ formatCLP(m.total) }}</td>
                <td>
                  <div class="month-dates">
                    {{ (aportesDatesByMonth.get(m.key) ?? []).join(", ") }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="row">
        <h2 class="h2">Historial de aportes</h2>
      </div>

      <div v-if="aportes.length === 0" class="card muted">
        Aún no hay aportes registrados.
      </div>

      <div v-else class="card">
        <table class="table table-compact">
          <thead>
            <tr>
              <th>Fecha</th>
              <th class="right">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in aportes" :key="a.id">
              <td>{{ a.fecha }}</td>
              <td class="right">{{ formatCLP(a.valor) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-else class="muted">Persona no encontrada.</p>
  </div>
</template>
