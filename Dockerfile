FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
RUN apk add --no-cache chromium && mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
USER node
EXPOSE 3001
CMD ["npm", "start"]
