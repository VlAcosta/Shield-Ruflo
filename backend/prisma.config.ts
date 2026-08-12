import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://business_shield:business_shield@localhost:5433/business_shield';

export default defineConfig({
  // Prisma 7 loads every *.prisma file under this schema directory. Keep the
  // foundation in schema.prisma while new bounded domains can live in focused
  // schema files instead of growing the monolith indefinitely.
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
