# Foxtrot

Monorepo for the Foxtrot messenger: `back/` (Spring Boot) and `front/` (Nuxt).

- `back/` — Spring Boot 3 / Java 17 API + WebSocket chat backend. See `back/README.md`-equivalent docs / `back/.env.example`.
- `front/` — Nuxt 4 frontend. See `front/README.md` and `front/.env.example`.

Each side keeps its own dependency setup (`back/pom.xml`, `front/package.json`) and is run independently; this repo just keeps them in one place.
