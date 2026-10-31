/** True when running against the local SQLite test database (DATABASE_URL=file:...). PostgreSQL is the real database. */
export const isSqlite = () => (process.env.DATABASE_URL ?? "").startsWith("file:");
