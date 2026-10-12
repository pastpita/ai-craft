# AI CRAFT shared-world server: one simulation for every visitor
FROM node:20-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY web web
COPY server server
ENV NODE_ENV=production PORT=8080 AV_FILE=/data/world-data.json
EXPOSE 8080
CMD ["node", "server/server.js"]
