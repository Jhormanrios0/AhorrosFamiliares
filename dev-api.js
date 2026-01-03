import http from "node:http";
import dotenv from "dotenv";

// Load env vars for local development only.
// - .env.local already exists for Vite (VITE_* vars). Non-VITE vars are ignored by Vite but can be used here.
// - .env.server.local is optional if you prefer to keep server-only secrets separate.
dotenv.config({ path: ".env.server.local" });
dotenv.config({ path: ".env.local" });

// Convenience for local dev: if you already set VITE_SUPABASE_URL for the frontend,
// reuse it as SUPABASE_URL for this dev API.
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}

import createMemberHandler from "./api/create-member.js";
import usersHandler from "./api/users.js";

const PORT = process.env.DEV_API_PORT ? Number(process.env.DEV_API_PORT) : 8787;

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  if (url.startsWith("/api/create-member")) {
    return createMemberHandler(req, res);
  }

  if (url.startsWith("/api/users")) {
    return usersHandler(req, res);
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not Found");
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
});
