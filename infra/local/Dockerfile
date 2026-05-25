FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache docker-cli
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services ./services

RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm build

ENV NODE_ENV=development
