# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack pnpm install --frozen-lockfile
COPY . .

FROM base AS builder
# На маленьких серверах (1-2 ГБ RAM) V8 сам занижает лимит кучи по консервативной
# авто-детекции, и сборка Nuxt (Vite/Rollup-бандлинг) падает с "heap out of memory"
# даже когда своп/память физически есть - лимит именно в самонастройке V8, не в реальной
# нехватке. Явно поднимаем потолок, чтобы V8 использовал доступную память/своп.
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN corepack pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack pnpm install --prod --frozen-lockfile
COPY --from=builder /app/.output /app/.output
EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
