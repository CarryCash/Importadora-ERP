FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY . .
ARG BACKEND_URL=http://backend:3000
ENV BACKEND_URL=${BACKEND_URL}
RUN pnpm install --frozen-lockfile && pnpm --filter frontend build
EXPOSE 3000
CMD ["pnpm", "--filter", "frontend", "start", "--", "-p", "3000"]
