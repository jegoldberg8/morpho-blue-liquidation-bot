FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9.13.2 --activate

WORKDIR /app

# Copy package files for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/config/package.json apps/config/
COPY apps/client/package.json apps/client/
COPY apps/data-providers/package.json apps/data-providers/
COPY apps/liquidity-venues/package.json apps/liquidity-venues/
COPY apps/pricers/package.json apps/pricers/
COPY apps/hyperindex/package.json apps/hyperindex/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

CMD ["sh", "-c", "pnpm tsx apps/client/src/script.ts --env-file=.env"]
