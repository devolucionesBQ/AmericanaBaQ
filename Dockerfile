FROM node:22-slim
WORKDIR /app
COPY server ./server
COPY Index.html ./Index.html
ENV NODE_ENV=production
USER node
CMD ["node", "server/index.js"]
