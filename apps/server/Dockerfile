FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace @classpulse/server --include-workspace-root=false && npm i -g tsx
COPY packages/shared packages/shared
COPY apps/server apps/server
WORKDIR /app/apps/server
ENV NODE_ENV=production
EXPOSE 5000
CMD ["tsx", "src/index.ts"]
