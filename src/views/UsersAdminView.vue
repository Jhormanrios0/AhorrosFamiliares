<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabaseClient.js";

const router = useRouter();

const loading = ref(true);
const error = ref(null);
const success = ref(null);

const users = ref([]);
const selectedUserId = ref("");

const formNombre = ref("");
const formEmail = ref("");

const formPassword = ref("");
const formPassword2 = ref("");

const savingProfile = ref(false);
const savingPassword = ref(false);

const modalOpen = ref(false);
const modalTitle = ref("");
const modalBody = ref("");
const modalConfirmLabel = ref("Confirmar");
let modalAction = null;

const myUserId = ref(null);

const detailsOpen = ref(false);
const detailsRef = ref(null);

const selected = computed(() => {
  return users.value.find((u) => u.user_id === selectedUserId.value) ?? null;
});

const canSaveProfile = computed(() => {
  if (!selected.value) return false;
  if (!formNombre.value.trim()) return false;
  if (!formEmail.value.trim()) return false;
  return true;
});

const canSavePassword = computed(() => {
  if (!selected.value) return false;
  if (!formPassword.value) return false;
  if (formPassword.value.length < 6) return false;
  if (formPassword.value !== formPassword2.value) return false;
  return true;
});

function openConfirmModal({ title, body, confirmLabel, action }) {
  modalTitle.value = title;
  modalBody.value = body;
  modalConfirmLabel.value = confirmLabel || "Confirmar";
  modalAction = action;
  modalOpen.value = true;
}

async function confirmModal() {
  if (typeof modalAction !== "function") {
    modalOpen.value = false;
    return;
  }
  const action = modalAction;
  modalOpen.value = false;
  modalAction = null;
  await action();
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  myUserId.value = data.session?.user?.id ?? null;
  return data.session?.access_token ?? null;
}

async function load() {
  loading.value = true;
  error.value = null;
  success.value = null;
  try {
    const token = await getToken();
    if (!token) throw new Error("Sesión no válida.");

    const res = await fetch("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(payload?.error || "No se pudieron cargar usuarios.");

    users.value = Array.isArray(payload?.users) ? payload.users : [];
    // Safety: admins should never appear in this UI.
    users.value = users.value.filter(
      (u) => String(u?.role ?? "").toLowerCase() !== "admin"
    );

    if (users.value.length === 0) {
      selectedUserId.value = "";
      detailsOpen.value = false;
      applySelectedToForm();
      return;
    }

    const exists = users.value.some((u) => u.user_id === selectedUserId.value);
    if (!selectedUserId.value || !exists) {
      selectedUserId.value = users.value[0]?.user_id ?? "";
      detailsOpen.value = false;
    }
    applySelectedToForm();
  } catch (e) {
    error.value = e?.message ?? "No se pudieron cargar usuarios.";
  } finally {
    loading.value = false;
  }
}

function isOverlayScreen() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 519px)").matches;
}

async function selectUser(u) {
  selectedUserId.value = u.user_id;
  applySelectedToForm();
  detailsOpen.value = true;
  if (isOverlayScreen()) {
    await nextTick();
    detailsRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function backToList() {
  detailsOpen.value = false;
}

function applySelectedToForm() {
  const u = selected.value;
  if (!u) {
    formNombre.value = "";
    formEmail.value = "";
    formPassword.value = "";
    formPassword2.value = "";
    return;
  }
  formNombre.value = u.nombre ?? "";
  formEmail.value = u.email ?? "";
  formPassword.value = "";
  formPassword2.value = "";
}

async function saveProfile() {
  if (!canSaveProfile.value) return;
  savingProfile.value = true;
  error.value = null;
  success.value = null;

  try {
    const token = await getToken();
    if (!token) throw new Error("Sesión no válida.");

    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: selectedUserId.value,
        nombre: formNombre.value.trim(),
        email: formEmail.value.trim(),
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "No se pudo guardar.");

    success.value = "Perfil actualizado.";
    await load();
  } catch (e) {
    error.value = e?.message ?? "No se pudo guardar.";
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword() {
  if (!canSavePassword.value) return;
  savingPassword.value = true;
  error.value = null;
  success.value = null;

  try {
    const token = await getToken();
    if (!token) throw new Error("Sesión no válida.");

    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: selectedUserId.value,
        nombre: formNombre.value.trim(),
        password: formPassword.value,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "No se pudo guardar.");

    success.value = "Contraseña actualizada.";
    formPassword.value = "";
    formPassword2.value = "";
  } catch (e) {
    error.value = e?.message ?? "No se pudo guardar.";
  } finally {
    savingPassword.value = false;
  }
}

const canDeleteSelected = computed(() => {
  if (!selected.value) return false;
  if (selected.value.role === "admin") return false;
  if (myUserId.value && selected.value.user_id === myUserId.value) return false;
  return true;
});

async function deleteUser() {
  if (!canDeleteSelected.value) return;
  error.value = null;
  success.value = null;

  try {
    const token = await getToken();
    if (!token) throw new Error("Sesión no válida.");

    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: selectedUserId.value }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "No se pudo eliminar.");

    success.value = "Usuario eliminado.";
    // After deletion we want to return to the full list (100% width).
    detailsOpen.value = false;
    selectedUserId.value = "";
    await load();
  } catch (e) {
    error.value = e?.message ?? "No se pudo eliminar.";
  }
}

function goHome() {
  router.push({ name: "dashboard" });
}

onMounted(load);
</script>

<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Usuarios</h1>
        <div class="muted">Gestiona nombre, correo y contraseña</div>
      </div>
      <div class="row gap">
        <RouterLink class="button secondary" to="/usuarios/nuevo"
          >Crear usuario</RouterLink
        >
        <button class="button secondary" type="button" @click="goHome">
          Volver
        </button>
      </div>
    </div>

    <p v-if="loading" class="muted">Cargando…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div
      v-else
      class="grid-2 users-layout"
      :class="{ 'details-open': detailsOpen }"
    >
      <div class="card users-list">
        <div class="row" style="margin-bottom: 8px">
          <strong>Listado</strong>
          <button class="button secondary" type="button" @click="load">
            Recargar
          </button>
        </div>

        <p v-if="users.length === 0" class="muted">No hay usuarios.</p>

        <div v-else class="stack users-list-scroll" style="margin-top: 0">
          <button
            v-for="u in users"
            :key="u.user_id"
            type="button"
            class="list-item"
            :class="{ active: u.user_id === selectedUserId }"
            @click="selectUser(u)"
          >
            <div class="row" style="width: 100%">
              <div>
                <div>
                  <strong>{{ u.nombre || "(sin nombre)" }}</strong>
                </div>
                <div class="muted" style="font-size: 0.9rem">
                  {{ u.email || u.user_id }}
                </div>
                <div class="row" style="justify-content: flex-start; gap: 8px">
                  <span class="badge">{{
                    u.role === "admin" ? "admin" : "member"
                  }}</span>
                  <span class="badge">{{ u.frecuencia || "mensual" }}</span>
                  <span class="badge" v-if="u.persona_id">persona ✓</span>
                  <span class="badge" v-else>sin persona</span>
                </div>
              </div>
              <span class="muted" style="white-space: nowrap">→</span>
            </div>
          </button>
        </div>
      </div>

      <div class="stack users-details" ref="detailsRef">
        <div class="card">
          <div class="row users-details-top" style="margin-bottom: 8px">
            <button class="button secondary" type="button" @click="backToList">
              Volver al listado
            </button>
            <button class="button secondary" type="button" @click="load">
              Recargar
            </button>
          </div>

          <div class="row" style="margin-bottom: 8px">
            <strong>Perfil</strong>
            <span class="badge" v-if="selected">{{ selected.role }}</span>
          </div>

          <p v-if="!selected" class="muted">Selecciona un usuario.</p>

          <template v-else>
            <div class="row" style="justify-content: flex-start; gap: 8px">
              <span class="badge">{{ selected.frecuencia || "mensual" }}</span>
              <span class="badge" v-if="selected.persona_id">persona ✓</span>
              <span class="badge" v-else>sin persona</span>
            </div>

            <label class="field">
              <span>Nombre</span>
              <input
                v-model.trim="formNombre"
                type="text"
                autocomplete="off"
                required
              />
            </label>

            <label class="field">
              <span>Correo</span>
              <input
                v-model.trim="formEmail"
                type="email"
                autocomplete="off"
                required
              />
              <small class="muted"
                >Se actualiza en Auth (email del usuario)</small
              >
            </label>

            <label class="field">
              <span>Meta</span>
              <input
                :value="'1.100.000 (fija) – Ene a Nov'"
                type="text"
                readonly
                disabled
              />
            </label>

            <div class="row">
              <span class="muted">User ID</span>
              <span class="muted" style="font-size: 0.9rem">{{
                selected.user_id
              }}</span>
            </div>

            <div class="row" v-if="selected.persona_id">
              <span class="muted">Persona ID</span>
              <span class="muted" style="font-size: 0.9rem">{{
                selected.persona_id
              }}</span>
            </div>

            <p v-if="success" class="muted">{{ success }}</p>
            <p v-if="error" class="error">{{ error }}</p>

            <button
              class="button"
              type="button"
              :disabled="savingProfile || !canSaveProfile"
              @click="
                openConfirmModal({
                  title: 'Confirmar cambios de perfil',
                  body: `Se actualizará el nombre y correo de ${
                    selected.email || selected.user_id
                  }.`,
                  confirmLabel: 'Guardar perfil',
                  action: saveProfile,
                })
              "
            >
              {{ savingProfile ? "Guardando…" : "Guardar perfil" }}
            </button>

            <div class="row" style="justify-content: flex-end; gap: 10px">
              <button
                class="button danger"
                type="button"
                :disabled="!canDeleteSelected"
                @click="
                  openConfirmModal({
                    title: 'Eliminar usuario',
                    body: `Se eliminará el usuario ${
                      selected.email || selected.user_id
                    } y sus datos asociados. Esta acción no se puede deshacer.`,
                    confirmLabel: 'Eliminar',
                    action: deleteUser,
                  })
                "
              >
                Eliminar usuario
              </button>
            </div>

            <p
              v-if="selected.role === 'admin'"
              class="muted"
              style="margin: 8px 0 0"
            >
              No se permite eliminar usuarios admin desde la app.
            </p>
            <p
              v-else-if="myUserId && selected.user_id === myUserId"
              class="muted"
              style="margin: 8px 0 0"
            >
              No puedes eliminar tu propio usuario.
            </p>
          </template>
        </div>

        <div class="card">
          <div class="row" style="margin-bottom: 8px">
            <strong>Contraseña</strong>
            <span class="muted">Sección aparte</span>
          </div>

          <p v-if="!selected" class="muted">Selecciona un usuario.</p>

          <template v-else>
            <label class="field">
              <span>Nueva contraseña</span>
              <input
                v-model="formPassword"
                type="password"
                autocomplete="new-password"
                placeholder="Mínimo 6 caracteres"
              />
            </label>

            <label class="field">
              <span>Confirmar contraseña</span>
              <input
                v-model="formPassword2"
                type="password"
                autocomplete="new-password"
                placeholder="Repite la contraseña"
              />
              <small class="muted">Debe coincidir con la anterior</small>
            </label>

            <button
              class="button secondary"
              type="button"
              :disabled="savingPassword || !canSavePassword"
              @click="
                openConfirmModal({
                  title: 'Confirmar cambio de contraseña',
                  body: `Esto cambiará la contraseña del usuario ${
                    selected.email || selected.user_id
                  }.`,
                  confirmLabel: 'Cambiar contraseña',
                  action: savePassword,
                })
              "
            >
              {{ savingPassword ? "Cambiando…" : "Cambiar contraseña" }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <div
      v-if="modalOpen"
      class="modal-backdrop"
      @click.self="modalOpen = false"
    >
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <strong>{{ modalTitle }}</strong>
        </div>
        <p class="muted" style="margin: 8px 0 0">{{ modalBody }}</p>
        <div class="modal-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="savingProfile || savingPassword"
            @click="modalOpen = false"
          >
            Cancelar
          </button>
          <button
            class="button"
            type="button"
            :disabled="savingProfile || savingPassword"
            @click="confirmModal"
          >
            {{ modalConfirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-layout {
  align-items: stretch;
  display: flex;
  gap: 12px;
}

.users-list {
  flex: 1 1 100%;
  min-width: 0;
  transition: flex-basis 220ms ease;
}

.users-details {
  flex: 0 0 0;
  min-width: 0;
  max-width: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  transform: translateX(16px);
  transition: opacity 220ms ease, transform 220ms ease;
}

.users-layout.details-open .users-list {
  flex-basis: 50%;
}

.users-layout.details-open .users-details {
  flex: 1 1 50%;
  max-width: none;
  opacity: 1;
  pointer-events: auto;
  overflow: visible;
  transform: translateX(0);
}

.users-list-scroll {
  max-height: calc(100vh - 240px);
  overflow: auto;
  padding-right: 4px;
}

@media (max-width: 519px) {
  .users-details {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--bg);
    padding: 16px;
    overflow: auto;
    transform: translateX(100%);
    transition: transform 220ms ease;
    opacity: 1;
    pointer-events: auto;
    max-width: none;
  }

  .users-layout.details-open .users-details {
    transform: translateX(0);
  }

  .users-layout.details-open .users-list {
    display: none;
  }

  .users-details-top {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg);
    padding-bottom: 8px;
  }
}

@media (min-width: 860px) {
  .users-details-top {
    display: none;
  }
}
</style>
