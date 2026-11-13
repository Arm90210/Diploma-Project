import { PrismaClient } from '@prisma/client';

// One connection pool per API process, reused by routes and services.
export const db = new PrismaClient();
