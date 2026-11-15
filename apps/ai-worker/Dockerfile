FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/rag-core/package.json packages/rag-core/
COPY apps/ai-worker/package.json apps/ai-worker/
RUN npm ci --omit=dev --workspace @classpulse/ai-worker --include-workspace-root=false && npm i -g tsx
COPY packages/shared packages/shared
COPY packages/rag-core packages/rag-core
COPY apps/ai-worker apps/ai-worker
WORKDIR /app/apps/ai-worker
ENV NODE_ENV=production
CMD ["tsx", "src/index.ts"]
