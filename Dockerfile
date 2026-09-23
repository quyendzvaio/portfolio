# ponytail: single stage — `npm ci` pulls the client deps too, which the runtime
# image never touches. Fine at portfolio scale; split into build/runtime stages
# if image size ever matters.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server ./server
RUN npx tsc -p server/tsconfig.json

ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "server/dist/index.js"]
