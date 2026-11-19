import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;

if (!url || url.includes("DB_USER") || url.includes("DB_PASSWORD")) {
  console.error(
    "BLOCKED: DATABASE_URL is not set to a real value. Copy backend/.env.example to backend/.env (git-ignored) and fill it in.",
  );
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  const { rows } = await client.query("select 1 as ok");
  console.log(rows[0].ok === 1 ? "Database connection OK" : "Unexpected result");
} catch (err) {
  // Never print the connection string or credentials.
  console.error(`Database connection FAILED: ${err.code ?? err.name}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
