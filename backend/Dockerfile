# LibraCore API image
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first to benefit from layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Run as the unprivileged user provided by the Node image.
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", "src/server.js"]
