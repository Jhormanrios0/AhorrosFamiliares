import { supabase } from "@/lib/supabaseClient.js";
import { formatCLP } from "@/lib/money.js";

export function getYearRange(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) {
    const cy = new Date().getFullYear();
    return { year: cy, start: `${cy}-01-01`, end: `${cy}-12-31` };
  }
  return { year: y, start: `${y}-01-01`, end: `${y}-12-31` };
}

export function isMissingRelationError(err) {
  const msg = (err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();
  const details = String(err?.details ?? "").toLowerCase();
  const status = Number(err?.status ?? err?.statusCode ?? NaN);
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("42p01") ||
    // PostgREST missing table in schema cache
    code.includes("pgrst205") ||
    msg.includes("pgrst205") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    details.includes("pgrst205") ||
    status === 404
  );
}

export function toFriendlyError(err, fallback) {
  if (!err) return fallback;
  const message = err?.message ?? fallback;
  return message || fallback;
}

const ENABLE_META_OVERRIDES =
  String(import.meta?.env?.VITE_ENABLE_META_OVERRIDES ?? "").toLowerCase() ===
  "true";

export const SAVINGS_TOTAL = 1100000;
export const SAVINGS_START_MONTH = 1; // Jan
export const SAVINGS_END_MONTH = 11; // Nov
export const FREQUENCIES = ["mensual", "quincenal"];

export function normalizeFrequency(value) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();
  return v === "quincenal" ? "quincenal" : "mensual";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function buildDueDates({ year, frequency }) {
  const y = Number(year);
  const freq = normalizeFrequency(frequency);

  const dates = [];
  for (let m = SAVINGS_START_MONTH; m <= SAVINGS_END_MONTH; m += 1) {
    if (freq === "mensual") {
      dates.push(`${y}-${pad2(m)}-04`);
    } else {
      dates.push(`${y}-${pad2(m)}-05`);
      dates.push(`${y}-${pad2(m)}-20`);
    }
  }
  return dates;
}

export function buildAmounts(total, count) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const amounts = new Array(count);
  for (let i = 0; i < count; i += 1) {
    amounts[i] = base + (i < remainder ? 1 : 0);
  }
  return amounts;
}

export function buildSavingsPlan({
  year,
  frequency,
  total = SAVINGS_TOTAL,
} = {}) {
  const dates = buildDueDates({ year, frequency });
  const amounts = buildAmounts(Number(total) || 0, dates.length);
  return dates.map((date, idx) => ({
    index: idx + 1,
    date,
    amount: amounts[idx],
  }));
}

export function expectedAmountForDate({
  year,
  frequency,
  date,
  total = SAVINGS_TOTAL,
} = {}) {
  const plan = buildSavingsPlan({ year, frequency, total });
  const found = plan.find((p) => p.date === date);
  return found?.amount ?? null;
}

export function isAllowedContributionDate({ year, frequency, date } = {}) {
  const dates = buildDueDates({ year, frequency });
  return dates.includes(String(date));
}

export function yearFromISODate(isoDate) {
  const s = String(isoDate || "");
  const m = /^\s*(\d{4})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

export async function fetchAportesYearBounds({ personaId } = {}) {
  let minQuery = supabase
    .from("aportes")
    .select("fecha")
    .order("fecha", { ascending: true })
    .limit(1);

  let maxQuery = supabase
    .from("aportes")
    .select("fecha")
    .order("fecha", { ascending: false })
    .limit(1);

  if (personaId) {
    minQuery = minQuery.eq("persona_id", personaId);
    maxQuery = maxQuery.eq("persona_id", personaId);
  }

  const [minRes, maxRes] = await Promise.all([minQuery, maxQuery]);
  if (minRes.error) throw minRes.error;
  if (maxRes.error) throw maxRes.error;

  const minYear = yearFromISODate(minRes.data?.[0]?.fecha);
  const maxYear = yearFromISODate(maxRes.data?.[0]?.fecha);
  return { minYear, maxYear };
}

export async function fetchPersonas() {
  const { data, error } = await supabase
    .from("personas")
    .select("id,nombre,meta_anual,fecha_registro,user_id")
    .order("fecha_registro", { ascending: true });
  if (error) throw error;
  // Meta fija del plan (defense-in-depth): ignorar valores antiguos en DB.
  return (data ?? []).map((p) => ({ ...p, meta_anual: SAVINGS_TOTAL }));
}

export async function fetchAportesByRange({ start, end, personaId } = {}) {
  let query = supabase
    .from("aportes")
    .select("id,persona_id,valor,fecha")
    .gte("fecha", start)
    .lte("fecha", end);
  if (personaId) query = query.eq("persona_id", personaId);
  const { data, error } = await query.order("fecha", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchLatestAportes({ start, end, limit = 8 } = {}) {
  // Prefer join to personas for displaying the name.
  const joined = await supabase
    .from("aportes")
    .select("id,persona_id,valor,fecha,personas(nombre)")
    .gte("fecha", start)
    .lte("fecha", end)
    .order("fecha", { ascending: false })
    .limit(limit);

  if (!joined.error) {
    return (joined.data ?? []).map((a) => ({
      id: a.id,
      persona_id: a.persona_id,
      valor: a.valor,
      fecha: a.fecha,
      persona_nombre: a?.personas?.nombre ?? null,
    }));
  }

  // Fallback: fetch aportes, then map names client-side.
  const aportes = await fetchAportesByRange({ start, end });
  const slice = aportes.slice(0, limit);
  const personas = await fetchPersonas();
  const byId = new Map(personas.map((p) => [p.id, p]));
  return slice.map((a) => ({
    ...a,
    persona_nombre: byId.get(a.persona_id)?.nombre ?? null,
  }));
}

export async function fetchMetaOverridesForYear(year) {
  // Optional table (if you later add it): public.metas_anuales(persona_id uuid, year int, meta_anual int)
  if (!ENABLE_META_OVERRIDES) return new Map();
  // Cache if the table does not exist to avoid repeated 404 requests.
  if (fetchMetaOverridesForYear._unavailable) return new Map();
  try {
    const { data, error } = await supabase
      .from("metas_anuales")
      .select("persona_id,meta_anual")
      .eq("year", Number(year));
    if (error) throw error;
    const map = new Map();
    for (const r of data ?? []) map.set(r.persona_id, r.meta_anual);
    return map;
  } catch (e) {
    if (isMissingRelationError(e)) {
      fetchMetaOverridesForYear._unavailable = true;
      return new Map();
    }
    return new Map();
  }
}

// Internal flag (function property) used to stop retrying optional table calls when it doesn't exist.
fetchMetaOverridesForYear._unavailable = false;

export function totalsByPersona(aportes) {
  const totals = {};
  for (const a of aportes ?? []) {
    const id = a.persona_id;
    totals[id] = (totals[id] ?? 0) + (a.valor ?? 0);
  }
  return totals;
}

export function sumMeta(personas, metaOverridesMap) {
  let total = 0;
  for (const p of personas ?? []) {
    const meta = metaOverridesMap?.get?.(p.id) ?? SAVINGS_TOTAL;
    total += meta;
  }
  return total;
}

export function sumAportes(aportes) {
  return (aportes ?? []).reduce((acc, a) => acc + (a.valor ?? 0), 0);
}

export function monthKeyFromISODate(isoDate) {
  const s = String(isoDate || "");
  // Expect YYYY-MM-DD
  return s.length >= 7 ? s.slice(0, 7) : "";
}

export function groupAportesByMonth(aportes) {
  const groups = new Map();
  for (const a of aportes ?? []) {
    const key = monthKeyFromISODate(a.fecha);
    if (!key) continue;
    const prev = groups.get(key) ?? { key, total: 0, count: 0 };
    prev.total += a.valor ?? 0;
    prev.count += 1;
    groups.set(key, prev);
  }
  // Desc by month
  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}

export function monthsLeftInYear(year) {
  const y = Number(year);
  const now = new Date();
  if (now.getFullYear() !== y) return 12;
  return 12 - now.getMonth(); // Jan=0 => 12 months left including current
}

export function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(rows) {
  const safe = (v) => {
    const s = String(v ?? "");
    const escaped = s.replaceAll('"', '""');
    return `"${escaped}"`;
  };

  if (!Array.isArray(rows) || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(safe).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => safe(r[h])).join(","));
  }
  return lines.join("\n");
}

export function exportPersonasSummaryCsv({
  year,
  personas,
  aportesTotals,
  metaOverridesMap,
}) {
  const rows = (personas ?? []).map((p) => {
    const meta = metaOverridesMap?.get?.(p.id) ?? SAVINGS_TOTAL;
    const total = aportesTotals?.[p.id] ?? 0;
    const restante = Math.max(0, meta - total);
    const percent = meta ? ((total / meta) * 100).toFixed(1) : "0.0";
    return {
      year,
      persona: p.nombre,
      meta_anual: meta,
      aportado: total,
      restante,
      avance_pct: percent,
    };
  });
  return rows;
}

export function exportAportesCsv({ year, personaNombre, aportes }) {
  const rows = (aportes ?? []).map((a) => ({
    year,
    persona: personaNombre ?? "",
    fecha: a.fecha,
    monto: a.valor,
    monto_clp: formatCLP(a.valor ?? 0),
  }));
  return rows;
}

export async function tryAuditLog(event) {
  // Optional table: public.audit_log
  try {
    const { error } = await supabase.from("audit_log").insert(event);
    if (error) throw error;
    return true;
  } catch (e) {
    if (isMissingRelationError(e)) return false;
    return false;
  }
}
