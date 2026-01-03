# AhorrosFamiliares (MVP)

SPA Vue 3 + Supabase (Postgres + Auth) + despliegue en Vercel.

## 1) Crear Supabase

1. Crea un proyecto en Supabase.
2. Ve a **SQL Editor** y ejecuta el script: `docs/supabase.sql`.
3. (Nuevo) Ejecuta también: `docs/supabase-auth-roles.sql` para separar Admin vs Usuarios.
4. Ve a **Authentication > Providers** y asegúrate que **Email** esté habilitado.
   - Recomendado para MVP familiar: desactiva **Confirm email** para que el registro sea inmediato.
5. (Recomendado) Ve a **Authentication > Settings** y desactiva los **signups públicos**.
   - La app está pensada para que el **admin cree los usuarios member**.
6. Ve a **Authentication > Users** y crea **un usuario admin** (email/contraseña).
7. En **Authentication > Users**, copia el **id (UUID)** del admin y en SQL Editor ejecuta el `insert` indicado al final de `docs/supabase-auth-roles.sql` para marcarlo como admin.
8. Ve a **Project Settings > API** y copia:
   - `URL`
   - `anon public key`

## 2) Configurar variables local

Crea un archivo `.env.local` (no se versiona) basado en `.env.example`:

- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`

## 3) Ejecutar en local

```bash
npm install
npm run dev:api
npm run dev
```

- `npm run dev:api` levanta un mini servidor local en `http://localhost:8787` para `/api/create-member`.
- `npm run dev` levanta Vite en `http://localhost:5173` y hace proxy de `/api` hacia el dev-api.

Puedes poner las variables server-only en `.env.local` (Vite ignora las que no tienen prefijo `VITE_`) o en `.env.server.local`.

## 4) Desplegar en Vercel (GitHub)

1. Sube el repo a GitHub.
2. En Vercel: **New Project** -> importa el repo.
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` (igual a la de arriba, pero para el serverless)
   - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings -> API -> service_role key)
4. Deploy.

## Notas de seguridad (MVP)

- El frontend usa `anon key` (normal en Supabase). La seguridad real se define con RLS.
- La `service_role key` debe estar **solo** en Vercel (nunca en `VITE_...`).
- El admin crea usuarios normales desde la ruta `/usuarios/nuevo`.
- Solo el admin puede registrar aportes.
