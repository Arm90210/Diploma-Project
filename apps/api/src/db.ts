import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required; configure apps/api/.env");

// One bounded PostgreSQL pool per API process.
const adapter = new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 3000 });
export const db = new PrismaClient({ adapter });
