# 前端：多階段建置（Vite build）→ 以 nginx 提供靜態檔。
# VITE_API_URL 於 build 階段注入（瀏覽器需可直接連到 API 的對外位址）。
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
