import { createClient } from "@supabase/supabase-js";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (!raw || typeof raw !== "string") return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function readJsonBody(req) {
  if (req.body) return req.body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

async function requireAdmin(adminClient, token) {
  const { data: userData, error: userErr } = await adminClient.auth.getUser(
    token
  );
  if (userErr || !userData?.user?.id)
    return { ok: false, status: 401, error: "Invalid session" };

  const callerUserId = userData.user.id;
  const { data: roleRow, error: roleErr } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerUserId)
    .maybeSingle();

  if (roleErr) return { ok: false, status: 500, error: roleErr.message };
  if (String(roleRow?.role ?? "").toLowerCase() !== "admin")
    return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, callerUserId };
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    const isVercel = Boolean(process.env.VERCEL);
    return json(res, 500, {
      error:
        "Server is missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env vars.",
      ...(isVercel
        ? {}
        : {
            missing: {
              SUPABASE_URL: !supabaseUrl,
              SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
            },
          }),
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Missing bearer token" });

  const adminCheck = await requireAdmin(adminClient, token);
  if (!adminCheck.ok)
    return json(res, adminCheck.status, { error: adminCheck.error });

  if (req.method === "GET") {
    try {
      // listUsers uses pagination; for family MVP, one page is enough.
      const { data: usersData, error: usersErr } =
        await adminClient.auth.admin.listUsers({ perPage: 200 });
      if (usersErr) return json(res, 500, { error: usersErr.message });

      const authUsers = usersData?.users ?? [];
      const userIds = authUsers.map((u) => u.id);

      const { data: rolesData, error: rolesErr } = await adminClient
        .from("user_roles")
        .select("user_id,role")
        .in("user_id", userIds);
      if (rolesErr) return json(res, 500, { error: rolesErr.message });

      const { data: personasData, error: personasErr } = await adminClient
        .from("personas")
        .select("id,user_id,nombre,meta_anual,frecuencia")
        .in("user_id", userIds);
      if (personasErr) return json(res, 500, { error: personasErr.message });

      const roleMap = new Map(
        (rolesData ?? []).map((r) => [r.user_id, r.role])
      );
      const personaMap = new Map(
        (personasData ?? []).map((p) => [p.user_id, p])
      );

      const merged = authUsers
        .map((u) => {
          const p = personaMap.get(u.id);
          const roleRaw = roleMap.get(u.id) ?? "member";
          const roleNorm = String(roleRaw).toLowerCase();
          return {
            user_id: u.id,
            email: u.email,
            role: roleNorm === "admin" ? "admin" : "member",
            persona_id: p?.id ?? null,
            nombre: p?.nombre ?? null,
            meta_anual: p?.meta_anual ?? 1100000,
            frecuencia: p?.frecuencia ?? "mensual",
          };
        })
        // Admins are managed outside this UI; never include them in the list.
        // Also exclude the caller (the logged-in admin) defensively.
        .filter(
          (u) => u.user_id !== adminCheck.callerUserId && u.role !== "admin"
        )
        .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

      return json(res, 200, { users: merged });
    } catch (e) {
      return json(res, 500, { error: e?.message ?? "Failed to list users" });
    }
  }

  if (req.method === "DELETE") {
    const body = await readJsonBody(req);
    const user_id = (body?.user_id ?? "").toString();

    if (!user_id) return json(res, 400, { error: "user_id is required" });
    if (user_id === adminCheck.callerUserId) {
      return json(res, 400, { error: "No puedes eliminar tu propio usuario" });
    }

    try {
      const { data: roleRow, error: roleErr } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .maybeSingle();
      if (roleErr) return json(res, 500, { error: roleErr.message });
      if (String(roleRow?.role ?? "").toLowerCase() === "admin") {
        return json(res, 400, { error: "No se puede eliminar un admin" });
      }

      // Delete persona(s) first to cleanup aportes via FK cascade.
      const { error: delPersonaErr } = await adminClient
        .from("personas")
        .delete()
        .eq("user_id", user_id);
      if (delPersonaErr)
        return json(res, 500, { error: delPersonaErr.message });

      // Best-effort delete role row (auth.users deletion should cascade, but keep DB tidy).
      await adminClient.from("user_roles").delete().eq("user_id", user_id);

      const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(
        user_id
      );
      if (delAuthErr) return json(res, 500, { error: delAuthErr.message });

      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 500, { error: e?.message ?? "Failed to delete user" });
    }
  }

  if (req.method === "PATCH") {
    const body = await readJsonBody(req);
    const user_id = (body?.user_id ?? "").toString();
    const nombre = (body?.nombre ?? "").toString().trim();
    const email = body?.email ? String(body.email).trim().toLowerCase() : null;
    const password = body?.password ? String(body.password) : null;

    if (!user_id) return json(res, 400, { error: "user_id is required" });
    if (!nombre) return json(res, 400, { error: "nombre is required" });
    if (password && password.length < 6) {
      return json(res, 400, {
        error: "Password must be at least 6 characters",
      });
    }
    if (email && !/^\S+@\S+\.[A-Za-z]{2,}$/.test(email)) {
      return json(res, 400, { error: "Email inválido" });
    }

    try {
      // Update persona (create if missing)
      const { data: existingPersona, error: personaGetErr } = await adminClient
        .from("personas")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (personaGetErr)
        return json(res, 500, { error: personaGetErr.message });

      if (existingPersona?.id) {
        const { error: updErr } = await adminClient
          .from("personas")
          .update({ nombre, meta_anual: 1100000 })
          .eq("id", existingPersona.id);
        if (updErr) return json(res, 500, { error: updErr.message });
      } else {
        const { error: insErr } = await adminClient.from("personas").insert({
          user_id,
          nombre,
          meta_anual: 1100000,
          frecuencia: "mensual",
        });
        if (insErr) return json(res, 500, { error: insErr.message });

        // Defense-in-depth: ensure meta_anual is fixed even if DB defaults/triggers mutate it.
        await adminClient
          .from("personas")
          .update({ meta_anual: 1100000 })
          .eq("user_id", user_id);
      }

      if (email) {
        const { error: emailErr } = await adminClient.auth.admin.updateUserById(
          user_id,
          { email }
        );
        if (emailErr) return json(res, 500, { error: emailErr.message });
      }

      if (password) {
        const { error: pwdErr } = await adminClient.auth.admin.updateUserById(
          user_id,
          { password }
        );
        if (pwdErr) return json(res, 500, { error: pwdErr.message });
      }

      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 500, { error: e?.message ?? "Failed to update user" });
    }
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return json(res, 405, { error: "Method not allowed" });
}
