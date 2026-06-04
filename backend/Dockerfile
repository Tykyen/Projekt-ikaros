FROM docker.io/library/node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM docker.io/library/node:20-bookworm-slim AS production

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
