<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient.js";
import { getMyPersonaId, getMyRole } from "@/lib/account.js";

const router = useRouter();
const route = useRoute();

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref(null);
const info = ref(null);

const showMissingEnv = !isSupabaseConfigured || route.query.missingEnv === "1";
const showNoPersona = computed(() => route.query.noPersona === "1");

async function redirectAfterAuth() {
  const role = await getMyRole();
  if (role === "admin") {
    const redirect =
      typeof route.query.redirect === "string" ? route.query.redirect : "/";
    await router.replace(redirect);
    return { navigated: true };
  }

  const personaId = await getMyPersonaId();
  if (personaId) {
    await router.replace({ name: "person", params: { id: personaId } });
    return { navigated: true };
  }

  return { navigated: false, noPersona: true };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tiempo de espera agotado.")), ms)
    ),
  ]);
}

async function onSubmit() {
  error.value = null;
  info.value = null;

  if (!isSupabaseConfigured) {
    error.value =
      "Faltan variables de entorno de Supabase. En local, crea .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. En Vercel, agrégalas en Settings → Environment Variables y vuelve a desplegar (Redeploy).";
    return;
  }

  loading.value = true;
  try {
    const { error: signInError } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      }),
      15000
    );
    if (signInError) throw signInError;

    const result = await redirectAfterAuth();
    if (!result?.navigated && result?.noPersona) {
      error.value =
        "Ingresaste, pero tu cuenta no tiene una persona asociada. Si este usuario debe ser admin, marca su rol en Supabase (tabla user_roles). Si es usuario normal, pídele al admin que lo cree.";
    }
  } catch (e) {
    error.value = e?.message ?? "No se pudo continuar.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-side">
          <div class="login-illustration" aria-hidden="true">
            <svg viewBox="0 0 520 360" role="img" focusable="false">
              <defs>
                <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#ffffff" stop-opacity="0.18" />
                  <stop offset="1" stop-color="#ffffff" stop-opacity="0.06" />
                </linearGradient>
                <linearGradient id="coinFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#ffffff" stop-opacity="0.95" />
                  <stop offset="1" stop-color="#ffffff" stop-opacity="0.55" />
                </linearGradient>
              </defs>

              <!-- subtle background shapes -->
              <circle
                cx="110"
                cy="120"
                r="74"
                fill="#ffffff"
                fill-opacity="0.08"
              />
              <circle
                cx="410"
                cy="90"
                r="56"
                fill="#ffffff"
                fill-opacity="0.08"
              />
              <circle
                cx="420"
                cy="250"
                r="96"
                fill="#ffffff"
                fill-opacity="0.06"
              />

              <!-- card/glass panel -->
              <rect
                x="90"
                y="86"
                width="340"
                height="208"
                rx="26"
                fill="url(#glass)"
                stroke="#ffffff"
                stroke-opacity="0.18"
                stroke-width="2"
              />

              <!-- coin stack -->
              <g transform="translate(136 142)">
                <g>
                  <ellipse
                    cx="86"
                    cy="114"
                    rx="86"
                    ry="32"
                    fill="url(#coinFill)"
                    opacity="0.9"
                  />
                  <path
                    d="M0 114v-54c0-18 38-32 86-32s86 14 86 32v54"
                    fill="#ffffff"
                    fill-opacity="0.10"
                  />
                  <ellipse
                    cx="86"
                    cy="60"
                    rx="86"
                    ry="32"
                    fill="#ffffff"
                    fill-opacity="0.10"
                  />
                  <ellipse
                    cx="86"
                    cy="60"
                    rx="66"
                    ry="24"
                    fill="#ffffff"
                    fill-opacity="0.10"
                  />
                </g>
                <g transform="translate(0 -56)">
                  <ellipse
                    cx="86"
                    cy="114"
                    rx="86"
                    ry="32"
                    fill="url(#coinFill)"
                    opacity="0.86"
                  />
                  <path
                    d="M0 114v-48c0-18 38-32 86-32s86 14 86 32v48"
                    fill="#ffffff"
                    fill-opacity="0.09"
                  />
                  <ellipse
                    cx="86"
                    cy="66"
                    rx="86"
                    ry="32"
                    fill="#ffffff"
                    fill-opacity="0.10"
                  />
                  <ellipse
                    cx="86"
                    cy="66"
                    rx="66"
                    ry="24"
                    fill="#ffffff"
                    fill-opacity="0.10"
                  />
                </g>

                <!-- coin mark -->
                <g transform="translate(86 10)">
                  <circle
                    cx="0"
                    cy="0"
                    r="34"
                    fill="#ffffff"
                    fill-opacity="0.10"
                  />
                  <path
                    d="M-10 8c0 6 6 10 14 10s14-4 14-10-6-10-14-10c-6 0-10-2-10-6s4-6 10-6 10 2 10 6"
                    fill="none"
                    stroke="#ffffff"
                    stroke-opacity="0.80"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M4 -20v40"
                    stroke="#ffffff"
                    stroke-opacity="0.80"
                    stroke-width="4"
                    stroke-linecap="round"
                  />
                </g>
              </g>

              <!-- growth arrow -->
              <g transform="translate(305 124)">
                <path
                  d="M0 150v-78c0-12 10-22 22-22h78"
                  fill="none"
                  stroke="#ffffff"
                  stroke-opacity="0.32"
                  stroke-width="8"
                  stroke-linecap="round"
                />
                <path
                  d="M16 122l40-40 26 26 56-56"
                  fill="none"
                  stroke="#ffffff"
                  stroke-opacity="0.88"
                  stroke-width="10"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M126 40h30v30"
                  fill="none"
                  stroke="#ffffff"
                  stroke-opacity="0.88"
                  stroke-width="10"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </g>
            </svg>
          </div>
        </div>

        <div class="login-main">
          <div class="login-main-head">
            <h1>Ahorro familiar</h1>
            <div class="login-head-sub">Iniciar sesión</div>
            <div class="muted">Ingresa con tu usuario asignado.</div>
          </div>

          <div v-if="showMissingEnv" class="alert error">
            <div class="alert-title">Falta configuración de Supabase</div>
            <div class="muted">
              En local, crea <strong>.env.local</strong> con:
            </div>
            <pre class="codebox">
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...</pre
            >
            <div class="muted" style="margin-top: 10px">
              En Vercel: Settings → Environment Variables → agrega esas mismas
              variables (Key/Value) y luego Redeploy.
            </div>
            <div class="muted">
              Los valores están en Supabase → Project Settings → API.
            </div>
          </div>

          <div v-if="showNoPersona" class="alert error">
            <div class="alert-title">
              Tu cuenta no tiene una persona asociada
            </div>
            <div class="muted">
              Pídele al admin que te cree el usuario y la persona asociada.
            </div>
          </div>

          <form class="login-form" @submit.prevent="onSubmit">
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
              <span>Contraseña</span>
              <input
                v-model="password"
                type="password"
                autocomplete="current-password"
                required
              />
            </label>

            <p v-if="info" class="muted" style="margin: 0">{{ info }}</p>
            <p v-if="error" class="error" style="margin: 0">{{ error }}</p>

            <button
              class="button login-submit"
              type="submit"
              :disabled="loading"
            >
              {{ loading ? "Procesando…" : "Ingresar" }}
            </button>

            <div class="muted" style="font-size: 0.9rem">
              ¿No tienes acceso? Pídeselo al admin.
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
