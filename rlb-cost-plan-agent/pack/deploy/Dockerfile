# Cost-plan check MCP server: container image. NOT DEPLOYED.
# Build from the pack folder:  docker build -f deploy/Dockerfile -t cost-plan-check:1.0.0 mcp-server
# Pin the base image by digest when it is built for real (docker buildx imagetools inspect node:22-alpine).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, from the lockfile, without dev tools.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Only what the server needs at run time: no tests, no generators.
COPY core ./core
COPY server ./server
COPY data ./data

# Listen on all interfaces inside the container; the platform terminates TLS in front.
ENV HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080

# Run as the unprivileged user that the official image provides.
USER node

HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

# MCP_BEARER_TOKEN and ALLOWED_HOSTS come from the platform (secret and environment variable).
CMD ["node", "server/http.js"]
