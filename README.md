# Vidriera Melody Music

Vidriera comunitaria de emprendimientos + calendario de eventos para academias de música.
Producto GIZA. Cliente de ejemplo: **Melody Music**.

- Especificación funcional: [`ESPECIFICACION.md`](./ESPECIFICACION.md)
- Arquitectura (estable): [`ARQUITECTURA.md`](./ARQUITECTURA.md)
- Estado / bitácora: [`ESTADO.md`](./ESTADO.md)

## Stack

Node.js (ESM) · Express · Supabase (Postgres + Auth + Storage) · JWT.
Tablas con prefijo `vidriera_`.

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completar con las claves de Supabase
npm run dev               # http://localhost:3000
```

Verificar: `GET /health` → `{ "status": "ok" }`.

## Base de datos

Aplicar en el SQL editor del proyecto Supabase, en orden:

1. `db/schema.sql` — tablas (prefijo `vidriera_`).
2. `db/seed.sql` — catálogo de módulos, categorías y academia de ejemplo.

## API (superficie)

Bajo `/api`. Los controladores aún no están implementados (responden `501`); la estructura
deja documentados los endpoints previstos.

| Módulo | Base | Auth |
|--------|------|------|
| Vidriera | `/api/publicaciones` | público + cliente |
| Eventos | `/api/eventos` | público + familias |
| Panel academia | `/api/admin` | rol `admin` |
| Panel GIZA | `/api/super-admin` | rol `super_admin` |
