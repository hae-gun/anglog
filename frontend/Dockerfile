# 1) build the site  2) serve it with Nginx, which also forwards /api, /media and /ws inside the stack
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# the browser connects to the park's realtime server here, e.g. wss://anglog.example.com/ws
ARG VITE_REALTIME_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
