import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  html: text("html").notNull(),
  css: text("css").notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => templates.id),
  imageUrl: text("image_url").notNull(),
  postedAt: timestamp("posted_at").notNull(),
  messageId: integer("message_id").notNull(),
});

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  publicKey: text("public_key").notNull(),
  secretKey: text("secret_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTemplateSchema = createInsertSchema(templates).pick({
  name: true,
  html: true,
  css: true,
});

export const insertPostSchema = createInsertSchema(posts).pick({
  templateId: true,
  imageUrl: true,
  postedAt: true,
  messageId: true,
});

export const insertWalletSchema = createInsertSchema(wallets).pick({
  userId: true,
  publicKey: true,
  secretKey: true,
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;