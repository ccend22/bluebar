# BlueBar on Cloud Run: build the app, then run the API and the built pages from one Node process.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The LuxHotel (Firebase) web settings are read by the browser bundle at build time.
ARG VITE_LUXHOTEL_API_KEY VITE_LUXHOTEL_AUTH_DOMAIN VITE_LUXHOTEL_PROJECT_ID VITE_LUXHOTEL_APP_ID
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/domain.js src/floorGeometry.js ./src/
COPY public/bluebar-print.mjs ./public/
USER node
CMD ["node", "server/cloudrun.js"]
