# Build the Angular SPA and serve both the SPA and the Express + MongoDB /api/*
# backend from a single container. Zero secrets are baked into this image:
# Kubernetes injects MONGO_URI & DB_NAME at runtime from the isolated paas-db-<slug> Secret.
FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22.23.4-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist/app/browser ./dist/app/browser
COPY server.mjs ./server.mjs
ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80
CMD ["node", "server.mjs"]
