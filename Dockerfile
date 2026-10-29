# docker build -t shiftchex . && docker run --rm -p 8080:8080 shiftchex

# node:sqlite needs Node 22.13 or newer, and alpine keeps the image small
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# no npm install, the app has no dependencies
COPY package.json ./
COPY src ./src

# the database starts empty and fills itself with the demo data on first start,
# so every deploy begins from a clean demo. it lives in data/, which node can write to
RUN mkdir data && chown node:node data
USER node

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/me > /dev/null || exit 1

CMD ["node", "src/ui/server.js"]
