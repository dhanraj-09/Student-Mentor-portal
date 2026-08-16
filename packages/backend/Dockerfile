# Shared dependency layer.
# All workspace manifests must be present or `npm ci` rejects the lock file as out of sync.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/

FROM deps AS development
RUN npm ci
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
EXPOSE 8080
CMD ["npm", "run", "dev", "-w", "backend"]

FROM deps AS builder
RUN npm ci
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN npm run build -w shared && npm run build -w backend

FROM deps AS production
ENV NODE_ENV=production
RUN npm ci --omit=dev
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "packages/backend/dist/index.js"]
