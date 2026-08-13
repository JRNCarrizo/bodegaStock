# API ControlStock — Railway / Docker
# Stage 1 (aprendizaje): SQLite en volumen. Postgres viene en la siguiente fase.

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# Ignorar postinstall (electron-builder → ABI Electron). Rebuild nativo para Node del contenedor.
RUN npm ci --ignore-scripts \
  && npm rebuild better-sqlite3

COPY server ./server
COPY tsconfig.node.json ./
COPY package.json ./

ENV NODE_ENV=production
ENV BODEGA_DATA_DIR=/data
ENV HOST=0.0.0.0
ENV PORT=3847

EXPOSE 3847

# Persistencia: montar Railway Volume en /data (no usar VOLUME en el Dockerfile)

CMD ["npx", "tsx", "server/standalone.ts"]
