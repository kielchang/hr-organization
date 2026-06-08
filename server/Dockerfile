# P1：以 tsx 直接執行（開發風格）。正式環境的多階段建置於後續 phase 強化。
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 3001
# 啟動前先套用尚未執行的 migration，再啟動 API。
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
