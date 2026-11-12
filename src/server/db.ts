import { PrismaClient, type Prisma } from "@prisma/client";

/** Money columns are DECIMAL(14,2) in the database; the whole app works with plain numbers (2 decimals, rounded with round2 when summed). */
const num = (v: Prisma.Decimal) => Number(v);
const numOrNull = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

function makeClient() {
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

export type Db = ReturnType<typeof makeClient>;
/** The transaction client handed to `db.$transaction(async (tx) => ...)`. */
export type DbTx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

const g = globalThis as unknown as { prisma?: Db };
export const db = g.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
