import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrate, introspect) needs a session connection, so it uses Supabase's direct URL (:5432).
// The app itself connects through the pooler via DATABASE_URL in lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
