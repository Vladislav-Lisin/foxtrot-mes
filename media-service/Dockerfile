FROM node:22-bookworm-slim AS builder
WORKDIR /app

# mediasoup компилирует нативный C++ worker при установке - нужны build-инструменты
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/dist dist
COPY package.json ./

EXPOSE 4000
# Реальный медиапоток идёт напрямую по UDP/TCP в этом диапазоне, мимо любого реверс-прокси
EXPOSE 40000-49999/udp
EXPOSE 40000-49999/tcp

CMD ["node", "dist/index.js"]
