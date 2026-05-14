import { defineConfig } from "drizzle-kit";

import { DEFAULT_DATABASE_URL } from "./src/config.js";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  },
});
