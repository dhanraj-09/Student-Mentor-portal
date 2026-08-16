FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/

FROM deps AS development
RUN npm ci
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "frontend", "--", "--host"]

FROM deps AS builder
RUN npm ci
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
RUN npm run build -w shared && npm run build -w frontend

# Production serves the static build through Nginx; no Node runtime needed.
FROM nginx:alpine AS production
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5173/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
