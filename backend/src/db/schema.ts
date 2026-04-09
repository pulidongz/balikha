import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: text("role", { enum: ["buyer", "seller", "admin"] })
    .default("buyer")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
