import { Context as TelegrafContext } from "telegraf";

declare module "telegraf" {
  interface Context {
    session: {
      tokenAddress?: string;
      lastAction?: 'buy' | 'sell';
      wallet?: {
        publicKey: string;
        secretKey: string;
      };
    };
  }

  interface Message {
    text?: string;
    message_id?: number;
  }
}

// Export the Context type with proper session handling
export interface BotContext extends TelegrafContext {
  session: {
    tokenAddress?: string;
    lastAction?: 'buy' | 'sell';
    wallet?: {
      publicKey: string;
      secretKey: string;
    };
  };
}