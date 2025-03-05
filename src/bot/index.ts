import { QuoteGetRequest, QuoteResponse, createJupiterApiClient, ResponseError } from '@jup-ag/api';
import { Keypair, Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { Markup } from 'telegraf';

// Constants for tokens
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
} as const;

// Initialize Jupiter API client and Solana connection
const ENDPOINT = process.env.JUPITER_API_URL || 'https://public.jupiterapi.com';
const CONFIG = {
  basePath: ENDPOINT
};
const jupiterApi = createJupiterApiClient(CONFIG);
const connection = new Connection('https://blue-crimson-fog.solana-mainnet.quiknode.pro/36328155c1011cd24738e952966f0aa0a5e2c619');

// Handle text input
bot.on('text', async (ctx) => {
  const text = ctx.message?.text;
  if (!text) return;

  // Initialize wallet if not exists
  if (!ctx.session.wallet) {
    const wallet = Keypair.generate();
    ctx.session.wallet = {
      publicKey: wallet.publicKey.toString(),
      secretKey: Buffer.from(wallet.secretKey).toString('hex')
    };
  }

  // If we're waiting for a token address (after /buy command)
  if (ctx.session.lastAction === 'buy' && !ctx.session.tokenAddress) {
    try {
      // Validate token address
      try {
        new PublicKey(text);
      } catch (e) {
        await ctx.reply('❌ Invalid token address. Please enter a valid Solana token address.', { parse_mode: 'Markdown' });
        return;
      }

      // Store the token address and ask for amount
      ctx.session.tokenAddress = text;
      await ctx.reply('💰 Please enter the amount in USDC you want to spend:', { parse_mode: 'Markdown' });
      return;
    } catch (error) {
      console.error('Error processing token address:', error);
      await ctx.reply('❌ Error processing token address. Please try again.', { parse_mode: 'Markdown' });
      return;
    }
  }

  // If we have a token address and waiting for amount
  if (ctx.session.tokenAddress && ctx.session.lastAction === 'buy') {
    const amount = parseFloat(text);
    if (isNaN(amount)) {
      return ctx.reply('❌ Please enter a valid number.', { parse_mode: 'Markdown' });
    }

    try {
      // 1. Prepare quote request
      const quoteRequest: QuoteGetRequest = {
        inputMint: TOKENS.USDC,
        outputMint: ctx.session.tokenAddress,
        amount: amount * 1e6, // Convert to USDC decimals
      };

      console.log('Quote Request:', quoteRequest);

      // 2. Get quote
      const quote = await jupiterApi.quoteGet(quoteRequest);
      if (!quote) {
        throw new Error('No quote found');
      }

      console.log('Quote Response:', quote);

      // 3. Format amounts for display
      const inputAmount = Number(quote.inAmount) / 1e6;
      const outputAmount = Number(quote.outAmount) / 1e9;
      const price = outputAmount / inputAmount;

      // 4. Create trade summary message
      const confirmKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('Confirm', `confirm_buy_${ctx.session.tokenAddress}_${amount}`),
          Markup.button.callback('Cancel', 'cancel_trade')
        ]
      ]);

      let message = `📝 Trade Summary - Pump Science Wallet\n\n`;
      message += `💰 Input: ${inputAmount.toFixed(6)} USDC\n`;
      message += `💎 Output: ${outputAmount.toFixed(6)} Tokens\n`;
      message += `💵 Price: 1 USDC = ${price.toFixed(6)} Tokens\n`;
      message += `📊 Price Impact: ${quote.priceImpactPct.toFixed(2)}%\n`;
      message += `⚡ Network Fee: ~0.000005 SOL\n\n`;
      message += `Would you like to proceed with this trade?`;

      await ctx.reply(message, confirmKeyboard);

    } catch (error) {
      if (error instanceof ResponseError) {
        console.error('Jupiter API error:', await error.response.json());
        await ctx.reply('❌ Error getting quote from Jupiter. Please try again.', { parse_mode: 'Markdown' });
      } else {
        console.error('Error:', error);
        await ctx.reply('❌ Error processing trade. Please try again.', { parse_mode: 'Markdown' });
      }
    }
  }
});

// Handle trade confirmation
bot.action(/confirm_buy_(.+)_(.+)/, async (ctx) => {
  try {
    const [_, tokenAddress, amountStr] = ctx.match;
    const amount = parseFloat(amountStr);

    await ctx.answerCbQuery();
    await ctx.reply('Processing your trade...');

    // 1. Get fresh quote
    const quoteRequest: QuoteGetRequest = {
      inputMint: TOKENS.USDC,
      outputMint: tokenAddress,
      amount: amount * 1e6,
    };

    const quote = await jupiterApi.quoteGet(quoteRequest);
    if (!quote) {
      throw new Error('No quote found');
    }

    // 2. Get user's wallet
    if (!ctx.session?.wallet?.secretKey) {
      throw new Error('Wallet not found in session');
    }
    const wallet = Keypair.fromSecretKey(
      Buffer.from(ctx.session.wallet.secretKey, 'hex')
    );

    // 3. Get swap transaction
    const swapResult = await jupiterApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
      },
    });

    if (!swapResult) {
      throw new Error('No swap result found');
    }

    console.log('Swap Result:', swapResult);
    
    await ctx.reply(
      `✅ Trade prepared successfully!\n\n` +
      `Transaction ready to be signed and sent.`
    );

  } catch (error) {
    if (error instanceof ResponseError) {
      console.error('Jupiter API error:', await error.response.json());
      await ctx.reply('❌ Error executing trade on Jupiter. Please try again.', { parse_mode: 'Markdown' });
    } else {
      console.error('Error:', error);
      await ctx.reply('❌ Error processing trade. Please try again.', { parse_mode: 'Markdown' });
    }
  }
}); 