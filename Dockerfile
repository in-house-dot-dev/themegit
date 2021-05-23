FROM node:12-alpine

RUN apk update
RUN apk add --no-cache git python3 ca-certificates curl && \
    curl -s https://shopify.github.io/themekit/scripts/install.py | python3 && \
    apk del curl

COPY ./* ./
RUN yarn install
ENTRYPOINT ["node", "/entrypoint.js"]
