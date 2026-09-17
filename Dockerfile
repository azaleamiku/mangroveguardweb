FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci \
  && apk del .build-deps
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && apk del .build-deps
COPY --from=build /app/dist ./dist
COPY server.js ./
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 8080
CMD ["npm", "start"]
