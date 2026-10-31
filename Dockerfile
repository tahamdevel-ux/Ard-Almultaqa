FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
# Chromium (for PDF output) + system libraries
RUN npx playwright install --with-deps chromium
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
# migrate on every start; optionally seed demo data (testing only: SEED_DEMO=1)
CMD ["sh", "-c", "npx prisma migrate deploy && { [ \"$SEED_DEMO\" != 1 ] || npx tsx prisma/seed.ts; } && npx next start -p 3000"]
