import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Money columns are DECIMAL(14,2) in the database; the whole app works with plain numbers (2 decimals, rounded with round2 when summed).
 *
 * Two clients are described here on purpose:
 *  - at RUN time, a query hook turns every Decimal in a result into a number, in place, so records stay plain objects
 *    (a Prisma *result extension* would also give numbers, but its records carry a hidden `Symbol(nodejs.util.inspect.custom)` property,
 *    which React refuses when a record goes from a Server Component to a Client Component);
 *  - at TYPE level, a result-extension client (never instantiated) tells TypeScript those fields are `number`.
 */
function numberify(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v;
  if (Prisma.Decimal.isDecimal(v)) return Number(v);
  if (v instanceof Date || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = numberify(v[i]); return v; }
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) o[k] = numberify(o[k]);
  return o;
}

const num = (v: Prisma.Decimal) => Number(v);
const numOrNull = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

/** Types only: never called. */
function typedClient() {
  return new PrismaClient().$extends({
    result: {
      trip: {
        sarfAmount: { needs: { sarfAmount: true }, compute: (r) => numOrNull(r.sarfAmount) },
        agentCommission: { needs: { agentCommission: true }, compute: (r) => numOrNull(r.agentCommission) },
      },
      booking: {
        priceAmount: { needs: { priceAmount: true }, compute: (r) => numOrNull(r.priceAmount) },
        sarfAmount: { needs: { sarfAmount: true }, compute: (r) => num(r.sarfAmount) },
      },
      tripHotel: { noHousingPrice: { needs: { noHousingPrice: true }, compute: (r) => numOrNull(r.noHousingPrice) } },
      tripHotelPrice: { amount: { needs: { amount: true }, compute: (r) => num(r.amount) } },
      tripAgentCommission: { amount: { needs: { amount: true }, compute: (r) => num(r.amount) } },
      payment: {
        amount: { needs: { amount: true }, compute: (r) => num(r.amount) },
        credited: { needs: { credited: true }, compute: (r) => num(r.credited) },
        bookingPrice: { needs: { bookingPrice: true }, compute: (r) => numOrNull(r.bookingPrice) },
      },
    },
  });
}

export type Db = ReturnType<typeof typedClient>;
/** The transaction client handed to `db.$transaction(async (tx) => ...)`. */
export type DbTx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

function runtimeClient(): Db {
  return new PrismaClient().$extends({
    query: { $allModels: { async $allOperations({ args, query }) { return numberify(await query(args)); } } },
  }) as unknown as Db;
}

const g = globalThis as unknown as { prisma?: Db };
export const db = g.prisma ?? runtimeClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
