FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter backend build
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter backend init:db && pnpm --filter backend start:prod"]
