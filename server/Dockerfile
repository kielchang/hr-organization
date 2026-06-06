# P1：以 tsx 直接執行（開發風格）。正式環境的多階段建置於後續 phase 強化。
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3001
CMD ["npm", "run", "start"]
