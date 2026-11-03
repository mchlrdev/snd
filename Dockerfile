FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN npx tsc && npm --prefix web run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN mkdir -p /data && chown node:node /data
ENV SND_DATA_DIR=/data
ENV SND_HOST=0.0.0.0
ENV SND_PORT=3000
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
