import { createRouter, createWebHistory } from "vue-router";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient.js";
import { getMyPersonaId, getMyRole } from "@/lib/account.js";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
    },
    {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/AdminDashboardView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/personas",
      name: "personas",
      component: () => import("@/views/HomeView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/person/:id",
      name: "person",
      component: () => import("@/views/PersonView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/aporte",
      name: "add-contribution",
      component: () => import("@/views/AddContributionView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/persona/nueva",
      name: "add-person",
      component: () => import("@/views/AddPersonView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/usuarios/nuevo",
      name: "create-user",
      component: () => import("@/views/CreateUserView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/usuarios",
      name: "users",
      component: () => import("@/views/UsersAdminView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  if (!isSupabaseConfigured) {
    return { name: "login", query: { missingEnv: "1", redirect: to.fullPath } };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  if (to.meta.requiresAdmin) {
    const role = await getMyRole();
    if (role === "admin") return true;

    const personaId = await getMyPersonaId();
    if (personaId) return { name: "person", params: { id: personaId } };
    return { name: "login", query: { noPersona: "1" } };
  }

  return true;
});

export default router;
