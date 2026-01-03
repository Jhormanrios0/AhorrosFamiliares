import { supabase } from "@/lib/supabaseClient.js";

let cache = {
  userId: null,
  role: null,
  personaId: null,
  forUserId: null,
};

export function primeAccountCache({ userId, role, personaId }) {
  if (typeof userId === "string" && userId) {
    if (cache.userId && cache.userId !== userId) {
      cache = { userId, role: null, personaId: null, forUserId: null };
    } else {
      cache.userId = userId;
    }
  }
  if (typeof role === "string" && role) {
    cache.role = role;
    cache.forUserId = cache.userId;
  }
  if ((typeof personaId === "string" && personaId) || personaId === null) {
    cache.personaId = personaId;
    cache.forUserId = cache.userId;
  }
}

export function clearAccountCache() {
  cache = { userId: null, role: null, personaId: null, forUserId: null };
}

export async function getMyUserId() {
  if (!supabase) return null;
  if (cache.userId) return cache.userId;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id ?? null;
  if (userId) cache.userId = userId;
  return userId;
}

export async function getMyRole() {
  const userId = await getMyUserId();
  if (!userId) return null;

  if (cache.forUserId === userId && cache.role) return cache.role;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const role = data?.role ?? "member";
  cache.role = role;
  cache.forUserId = userId;
  return role;
}

export async function getMyPersonaId() {
  const userId = await getMyUserId();
  if (!userId) return null;

  if (cache.forUserId === userId && typeof cache.personaId !== "undefined") {
    return cache.personaId;
  }

  const { data, error } = await supabase
    .from("personas")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const personaId = data?.id ?? null;
  cache.personaId = personaId;
  cache.forUserId = userId;
  return personaId;
}
