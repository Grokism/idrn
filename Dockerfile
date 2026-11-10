# Stage 1: Build the Angular 18 SPA
# Zero secrets are baked into this image: Kubernetes injects MONGO_URI & DB_NAME
# at runtime from the isolated paas-db-<slug> Secret.
FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production MEAN + Nginx runtime
# Nginx listens publicly on port 80 (serving the Angular SPA and reverse-proxying /api/*)
# while the Express + MongoDB backend runs internally on 127.0.0.1:3000.
FROM nginx:1.27-alpine
RUN apk add --no-cache nodejs npm
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist/app/browser /usr/share/nginx/html
COPY --from=build /app/dist/app/browser ./dist/app/browser
COPY server.mjs ./server.mjs
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV API_PORT=3000
ENV API_HOST=127.0.0.1
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
