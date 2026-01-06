<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient.js";
import {
  clearAccountCache,
  getMyPersonaId,
  getMyRole,
  primeAccountCache,
} from "@/lib/account.js";

const route = useRoute();
const router = useRouter();

const userEmail = ref(null);
const role = ref(null);
const myPersonaId = ref(null);
const loading = ref(false);
const error = ref(null);
const userMenuOpen = ref(false);
const sidebarPinned = ref(false);

const isAdmin = computed(() => role.value === "admin");

const showTopbar = computed(() => {
  if (!isSupabaseConfigured) return false;
  if (route.name === "login") return false;
  return Boolean(userEmail.value);
});

const userInitials = computed(() => {
  const email = userEmail.value || "";
  const first = email.split("@")[0] || "";
  const parts = first
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = (parts[0]?.[0] || "U") + (parts[1]?.[0] || "");
  return letters.toUpperCase().slice(0, 2);
});

async function refreshUser() {
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  userEmail.value = session?.user?.email ?? null;
  primeAccountCache({ userId: session?.user?.id ?? null });
  if (!session) {
    role.value = null;
    myPersonaId.value = null;
    clearAccountCache();
    return;
  }

  const [r, p] = await Promise.all([getMyRole(), getMyPersonaId()]);
  role.value = r;
  myPersonaId.value = p;
  primeAccountCache({ userId: session.user.id, role: r, personaId: p });

  // Prefetch key routes to make navigation feel instant.
  if (r === "admin") {
    import("@/views/AdminDashboardView.vue");
    import("@/views/HomeView.vue");
    import("@/views/UsersAdminView.vue");
    import("@/views/CreateUserView.vue");
    import("@/views/AddContributionView.vue");
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tiempo de espera agotado.")), ms)
    ),
  ]);
}

async function signOut() {
  if (!supabase) return;
  loading.value = true;
  error.value = null;
  try {
    // In some environments the SDK promise may hang even though the network request succeeds.
    // Use a timeout so the UI never gets stuck.
    await withTimeout(supabase.auth.signOut({ scope: "global" }), 8000);
  } catch (e) {
    // We'll still clear local UI state and redirect.
    error.value = e?.message ?? "No se pudo cerrar sesión.";
  } finally {
    userEmail.value = null;
    role.value = null;
    myPersonaId.value = null;
    userMenuOpen.value = false;
    clearAccountCache();
    await router.replace({ name: "login" });
    loading.value = false;
  }
}

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value;
}

function closeUserMenu() {
  userMenuOpen.value = false;
}

function toggleSidebarPinned() {
  sidebarPinned.value = !sidebarPinned.value;
  try {
    localStorage.setItem("sidebarPinned", sidebarPinned.value ? "1" : "0");
  } catch {
    // ignore
  }
}

let unsubscribe = null;
let onDocClick = null;

onMounted(async () => {
  try {
    sidebarPinned.value = localStorage.getItem("sidebarPinned") === "1";
  } catch {
    sidebarPinned.value = false;
  }

  if (!supabase) return;
  await refreshUser();

  const { data } = supabase.auth.onAuthStateChange(async () => {
    await refreshUser();
  });
  unsubscribe = data?.subscription;

  onDocClick = (e) => {
    const root = document.querySelector(".user-menu");
    if (!root) return;
    if (!userMenuOpen.value) return;
    if (root.contains(e.target)) return;
    userMenuOpen.value = false;
  };
  document.addEventListener("click", onDocClick);
});

onBeforeUnmount(() => {
  unsubscribe?.unsubscribe?.();
  if (onDocClick) document.removeEventListener("click", onDocClick);
});
</script>

<template>
  <div :class="showTopbar ? 'app-shell' : ''">
    <aside
      v-if="showTopbar"
      :class="['sidebar', sidebarPinned ? 'is-pinned' : '']"
    >
      <div class="sidebar-top">
        <div class="sidebar-brand-row">
          <RouterLink
            class="sidebar-brand"
            :to="
              isAdmin
                ? { name: 'dashboard' }
                : myPersonaId
                ? { name: 'person', params: { id: myPersonaId } }
                : { name: 'login' }
            "
          >
            <span class="sidebar-brand-mark" aria-hidden="true">A</span>
            <span class="sidebar-brand-text">Ahorros</span>
          </RouterLink>

          <button
            class="pin-button"
            type="button"
            :aria-pressed="sidebarPinned ? 'true' : 'false'"
            :title="sidebarPinned ? 'Desfijar sidebar' : 'Fijar sidebar'"
            @click="toggleSidebarPinned"
          >
            <svg
              class="pin-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M14 3l7 7-3 3v5l-4-4-4 4v-5L7 10l7-7Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">MENÚ</div>

          <nav class="sidebar-nav">
            <template v-if="isAdmin">
              <RouterLink
                class="sidelink"
                :to="{ name: 'dashboard' }"
                @pointerenter="() => import('@/views/AdminDashboardView.vue')"
              >
                <span class="sidelink-main">
                  <svg
                    class="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 13.5V20a1 1 0 0 0 1 1h5v-7.5H4Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M14 3h5a1 1 0 0 1 1 1v6.5h-6V3Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M14 13.5h6V20a1 1 0 0 1-1 1h-5v-7.5Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M4 3h6v7.5H4V4a1 1 0 0 1 1-1Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span class="sidelink-text">Dashboard</span>
                </span>
              </RouterLink>
              <RouterLink
                class="sidelink"
                :to="{ name: 'personas' }"
                @pointerenter="() => import('@/views/HomeView.vue')"
              >
                <span class="sidelink-main">
                  <svg
                    class="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-1A3.5 3.5 0 0 0 8 19.5V21"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                    <path
                      d="M20 21v-1.2a3 3 0 0 0-2.2-2.9"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M17 4.4a4 4 0 0 1 0 7.2"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span class="sidelink-text">Personas</span>
                </span>
              </RouterLink>
              <RouterLink
                class="sidelink"
                :to="{ name: 'users' }"
                @pointerenter="() => import('@/views/UsersAdminView.vue')"
              >
                <span class="sidelink-main">
                  <svg
                    class="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M8.5 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                    <path
                      d="M2.5 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M16 10h6"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M16 14h6"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M16 18h6"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span class="sidelink-text">Administrar usuarios</span>
                </span>
              </RouterLink>

              <button class="sidelink" type="button" disabled>
                <span class="sidelink-main">
                  <svg
                    class="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                    <path
                      d="M4 10h16"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                    <path
                      d="M8 14.5h4"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span class="sidelink-text">Préstamos</span>
                </span>
                <span class="badge">Próx.</span>
              </button>
            </template>

            <RouterLink
              v-else-if="myPersonaId"
              class="sidelink"
              :to="{ name: 'person', params: { id: myPersonaId } }"
              @pointerenter="() => import('@/views/PersonView.vue')"
            >
              <span class="sidelink-main">
                <svg
                  class="icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 18V6"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                  <path
                    d="M5 18h14"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                  <path
                    d="M7.5 14.5l3-3 2.5 2.5 4-5"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="sidelink-text">Mi progreso</span>
              </span>
            </RouterLink>
          </nav>
        </div>
      </div>

      <div class="sidebar-bottom">
        <div class="user-menu">
          <button
            class="user-button"
            type="button"
            :disabled="loading"
            @click="toggleUserMenu"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen ? 'true' : 'false'"
          >
            <span class="avatar" aria-hidden="true">{{ userInitials }}</span>
            <span class="user-button-label">{{ userEmail }}</span>
            <svg
              class="chev"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 7.5L10 12.5L15 7.5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div v-if="userMenuOpen" class="dropdown" role="menu">
            <div class="dropdown-section">
              <div class="muted" style="font-size: 0.85rem">Cuenta</div>
              <div class="dropdown-email">{{ userEmail }}</div>
              <div class="muted" style="font-size: 0.85rem">
                {{ isAdmin ? "★ admin" : "member" }}
              </div>
            </div>

            <div v-if="error" class="dropdown-section">
              <div class="error" style="margin: 0">{{ error }}</div>
            </div>

            <div class="dropdown-section">
              <button
                class="button secondary dropdown-action"
                type="button"
                :disabled="loading"
                @click="
                  async () => {
                    closeUserMenu();
                    await signOut();
                  }
                "
              >
                {{ loading ? "Saliendo…" : "Cerrar sesión" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main :class="showTopbar ? 'main' : ''">
      <RouterView />
    </main>
  </div>
</template>
