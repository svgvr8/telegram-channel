import { templates, posts, wallets, type Template, type InsertTemplate, type Post, type InsertPost, type Wallet, type InsertWallet } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  createTemplate(template: InsertTemplate): Promise<Template>;
  getTemplates(): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  getPosts(): Promise<Post[]>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  getWallet(userId: string): Promise<Wallet | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createTemplate(template: InsertTemplate): Promise<Template> {
    const [result] = await db.insert(templates).values(template).returning();
    return result;
  }

  async getTemplates(): Promise<Template[]> {
    return await db.select().from(templates);
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }

  async createPost(post: InsertPost): Promise<Post> {
    const [result] = await db.insert(posts).values(post).returning();
    return result;
  }

  async getPosts(): Promise<Post[]> {
    return await db.select().from(posts);
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    const [result] = await db.insert(wallets).values(wallet).returning();
    return result;
  }

  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return wallet;
  }
}

export const storage = new DatabaseStorage();