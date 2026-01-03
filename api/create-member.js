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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

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

  // 1) Validate caller session
  const { data: userData, error: userErr } = await adminClient.auth.getUser(
    token
  );
  if (userErr || !userData?.user?.id) {
    return json(res, 401, { error: "Invalid session" });
  }

  const callerUserId = userData.user.id;

  // 2) Validate caller is admin
  const { data: roleRow, error: roleErr } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerUserId)
    .maybeSingle();

  if (roleErr) return json(res, 500, { error: roleErr.message });
  if (roleRow?.role !== "admin") return json(res, 403, { error: "Forbidden" });

  // 3) Parse body
  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
  }

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();
  const nombre = (body?.nombre ?? "").toString().trim();
  const frecuenciaRaw = (body?.frecuencia ?? "mensual").toString().trim();
  const frecuencia =
    frecuenciaRaw.toLowerCase() === "quincenal" ? "quincenal" : "mensual";

  const meta_anual = 1100000;

  if (!email) return json(res, 400, { error: "Email is required" });
  if (password.length < 6) {
    return json(res, 400, { error: "Password must be at least 6 characters" });
  }
  if (!nombre) return json(res, 400, { error: "Nombre is required" });
  if (frecuencia !== "mensual" && frecuencia !== "quincenal") {
    return json(res, 400, { error: "frecuencia inválida" });
  }

  // 4) Create auth user (always as member)
  const { data: created, error: createErr } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createErr) return json(res, 400, { error: createErr.message });

  const newUserId = created?.user?.id;
  if (!newUserId) return json(res, 500, { error: "User creation failed" });

  try {
    const { error: insertRoleErr } = await adminClient
      .from("user_roles")
      .insert({ user_id: newUserId, role: "member" });
    if (insertRoleErr) throw insertRoleErr;

    const { error: insertPersonaErr } = await adminClient
      .from("personas")
      .insert({
        user_id: newUserId,
        nombre,
        meta_anual,
        frecuencia,
      });
    if (insertPersonaErr) throw insertPersonaErr;

    // Defense-in-depth: ensure meta_anual is fixed at 1.100.000 even if the DB default/trigger changes it.
    const { error: enforceMetaErr } = await adminClient
      .from("personas")
      .update({ meta_anual })
      .eq("user_id", newUserId);
    if (enforceMetaErr) throw enforceMetaErr;

    return json(res, 200, { ok: true, user_id: newUserId });
  } catch (e) {
    // Best-effort cleanup
    await adminClient.auth.admin.deleteUser(newUserId);
    return json(res, 500, { error: e?.message ?? "Failed to create member" });
  }
}
