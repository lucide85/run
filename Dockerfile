# syntax=docker/dockerfile:1

############################################
# Byggesteg – installerer alt og bygger
############################################
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Prisma trenger openssl tilstede ved generering
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Installer avhengigheter for alle workspaces (inkl. dev – trengs for bygg)
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

# Kopier resten av kildekoden (se .dockerignore for hva som holdes utenfor)
COPY . .

# Generer Prisma-klient (Linux-motor) + bygg backend og frontend
RUN npx prisma generate --schema=server/prisma/schema.prisma \
 && npm -w server run build \
 && npm -w client run build

############################################
# Kjøresteg – slankere image som kjører appen
############################################
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Kopier ferdige artefakter + avhengigheter fra byggesteget
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/client/package.json ./client/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/config.example.json ./config.example.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Databasen ligger her og persisteres via et Docker-volum
VOLUME ["/app/server/prisma/data"]

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
