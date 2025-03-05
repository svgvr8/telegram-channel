import { Connection, PublicKey, Keypair, VersionedTransaction, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Telegraf, Context } from "telegraf";
import LocalSession from "telegraf-session-local";
import { log } from "../vite";
import type { BotContext } from "./types";
import dotenv from "dotenv";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createApproveInstruction
} from '@solana/spl-token';
import { scheduleJob } from 'node-schedule';

dotenv.config();

// Use QuickNode RPC URL for Solana mainnet
const MAINNET_RPC = "https://blue-crimson-fog.solana-mainnet.quiknode.pro/36328155c1011cd24738e952966f0aa0a5e2c619/";

// Create a single connection instance for reuse
const connection = new Connection(MAINNET_RPC, {
  commitment: 'confirmed',
  wsEndpoint: MAINNET_RPC.replace('https', 'wss')
});

// First, let's add proper error handling and configuration
const JUPITER_CONFIG = {
  slippageBps: 100, // 1% slippage tolerance
  computeUnitPriceMicroLamports: 1000, // Remove prioritizationFeeLamports since we're using compute unit price
  minSolForTransaction: 0.005 * LAMPORTS_PER_SOL // 0.005 SOL for fees
};

// Add this helper for detailed error logging
function logTradeError(error: any, context: string, details: any = {}) {
  const errorLog = {
    context,
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    details
  };
  
  console.error('🚨 TRADE ERROR LOG:', JSON.stringify(errorLog, null, 2));
  log(`Trade error in ${context}: ${error.message}`, "telegram");
}

// Add this helper function to check and create token account
async function ensureTokenAccount(
  connection: Connection,
  wallet: Keypair,
  mint: string
): Promise<PublicKey> {
  try {
    const tokenMint = new PublicKey(mint);
    const owner = wallet.publicKey;
    
    // Don't create ATA for wrapped SOL
    if (mint === 'So11111111111111111111111111111111111111112') {
      return owner;
    }

    // Find the associated token address
    const associatedTokenAddress = await getAssociatedTokenAddress(
      tokenMint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log('Checking token account:', {
      mint,
      owner: owner.toString(),
      ata: associatedTokenAddress.toString()
    });

    // Check if the account exists
    const account = await connection.getAccountInfo(associatedTokenAddress);
    
    if (!account) {
      console.log('Creating token account for:', mint);
      
      const instruction = createAssociatedTokenAccountInstruction(
        owner,
        associatedTokenAddress,
        owner,
        tokenMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const transaction = new Transaction()
        .add(instruction);

      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = owner;

      console.log('Sending create ATA transaction...');
      const signature = await connection.sendTransaction(transaction, [wallet]);
      
      console.log('Confirming transaction:', signature);
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });

      if (confirmation.value.err) {
        throw new Error(`Failed to create token account: ${confirmation.value.err}`);
      }

      console.log('Created token account:', associatedTokenAddress.toString());
    } else {
      console.log('Token account already exists:', associatedTokenAddress.toString());
    }

    return associatedTokenAddress;
  } catch (error) {
    console.error('Error ensuring token account:', error);
    throw error;
  }
}

// Add this helper function at the top level
function toTokenAmount(amount: number, decimals: number = 9): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

// Update the getJupiterQuote function
async function getJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: string;
  onlyDirectRoutes?: boolean;
  platformFeeBps?: string;
  computeUnitPriceMicroLamports?: string;
}) {
  const queryParams = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps || '50',
    onlyDirectRoutes: (params.onlyDirectRoutes || false).toString(),
    platformFeeBps: params.platformFeeBps || '0',
  });

  if (params.computeUnitPriceMicroLamports) {
    queryParams.append('computeUnitPriceMicroLamports', params.computeUnitPriceMicroLamports);
  }

  const url = `https://public.jupiterapi.com/quote?${queryParams.toString()}`;
  console.log('Jupiter Quote Request:', url);

  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Jupiter Quote Error:', errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Update executeJupiterTrade function
async function executeJupiterTrade(
  userWallet: Keypair,
  inputMint: string,
  outputMint: string,
  amount: number,
  isSell: boolean = false
): Promise<string> {
  try {
    // Check wallet balance with detailed logging
    const walletBalance = await connection.getBalance(userWallet.publicKey);
    const requiredAmount = isSell 
      ? JUPITER_CONFIG.minSolForTransaction 
      : amount * LAMPORTS_PER_SOL + JUPITER_CONFIG.minSolForTransaction;
    
    const balanceCheck = {
      walletBalance: walletBalance / LAMPORTS_PER_SOL,
      requiredAmount: requiredAmount / LAMPORTS_PER_SOL,
      sufficient: walletBalance >= requiredAmount,
      details: {
        rawWalletBalance: walletBalance,
        rawRequiredAmount: requiredAmount,
        tradeAmount: amount,
        feesAmount: JUPITER_CONFIG.minSolForTransaction / LAMPORTS_PER_SOL,
        walletAddress: userWallet.publicKey.toString(),
        operationType: isSell ? 'sell' : 'buy'
      }
    };
    
    console.log('💰 Balance Check:', JSON.stringify(balanceCheck, null, 2));

    if (walletBalance < requiredAmount) {
      logTradeError(
        new Error('INSUFFICIENT_BALANCE'),
        'balance_check',
        balanceCheck
      );
      throw new Error('INSUFFICIENT_BALANCE');
    }

    // Ensure token accounts exist
    console.log('Ensuring token accounts exist...');
    try {
      await Promise.all([
        ensureTokenAccount(connection, userWallet, inputMint),
        ensureTokenAccount(connection, userWallet, outputMint)
      ]);
    } catch (error) {
      console.error('Failed to create token accounts:', error);
      logTradeError(error, 'token_account_creation');
      throw new Error('TOKEN_ACCOUNT_CREATION_FAILED');
    }

    // Get token accounts and mint info
    const inputMintPubkey = new PublicKey(inputMint);
    const tokenAccount = await getAssociatedTokenAddress(
      inputMintPubkey,
      userWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Get mint info to determine decimals
    const mintInfo = await connection.getParsedAccountInfo(inputMintPubkey);
    const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 9;
    
    console.log('Token info:', {
      mint: inputMint,
      decimals,
      amount,
      rawAmount: toTokenAmount(amount, decimals).toString()
    });

    // For sell orders, approve token spending
    if (isSell) {
      console.log('Setting up token approval...');
      const rawAmount = toTokenAmount(amount, decimals);
      
      console.log('Approving amount:', {
        humanReadable: amount,
        decimals,
        rawAmount: rawAmount.toString()
      });

      const approveIx = createApproveInstruction(
        tokenAccount,
        new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),
        userWallet.publicKey,
        rawAmount
      );

      const approveTransaction = new Transaction().add(approveIx);
      const latestBlockhash = await connection.getLatestBlockhash();
      approveTransaction.recentBlockhash = latestBlockhash.blockhash;
      approveTransaction.feePayer = userWallet.publicKey;

      try {
        const approveSig = await connection.sendTransaction(approveTransaction, [userWallet]);
        console.log('Approval transaction sent:', approveSig);
        
        const confirmation = await connection.confirmTransaction({
          signature: approveSig,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        });

        if (confirmation.value.err) {
          throw new Error(`Approval failed: ${confirmation.value.err}`);
        }

        console.log('Token approval set successfully');
      } catch (error) {
        console.error('Error setting token approval:', error);
        throw new Error('TOKEN_APPROVAL_FAILED');
      }
    }

    // Get quote with raw amount
    const rawAmount = toTokenAmount(amount, decimals).toString();
    console.log('Fetching quote with parameters:', {
      inputMint,
      outputMint,
      amount: rawAmount,
      slippageBps: '100'
    });

    const quoteResponse = await getJupiterQuote({
      inputMint,
      outputMint,
      amount: rawAmount,
      slippageBps: '100',
      onlyDirectRoutes: false,
      platformFeeBps: '0',
      computeUnitPriceMicroLamports: '1000'
    });

    console.log('📊 Quote Response:', JSON.stringify(quoteResponse, null, 2));

    // Get swap transaction
    console.log('Requesting swap transaction...');
    const swapResponse = await fetch('https://public.jupiterapi.com/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: userWallet.publicKey.toString(),
        computeUnitPriceMicroLamports: 1000,  // Keep this
        // Remove prioritizationFeeLamports
        dynamicComputeUnitLimit: true
      })
    });

    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      console.error('Swap API Error:', errorText);
      throw new Error(`Swap API error: ${swapResponse.status} - ${errorText}`);
    }

    const swapData = await swapResponse.json();
    console.log('💫 Swap Response:', JSON.stringify(swapData, null, 2));

    if (swapData.error || swapData.simulationError) {
      const error = swapData.error || swapData.simulationError.error;
      console.error('Swap error:', error);
      throw new Error(`SWAP_ERROR: ${error}`);
    }

    // Decode and send transaction
    console.log('Decoding and sending transaction...');
    const swapTransaction = VersionedTransaction.deserialize(
      Buffer.from(swapData.swapTransaction, 'base64')
    );

    console.log('📝 Transaction Details:', {
      numSigners: swapTransaction.message.header.numRequiredSignatures,
      numReadonlySigners: swapTransaction.message.header.numReadonlySignedAccounts,
      numReadonlyNonSigners: swapTransaction.message.header.numReadonlyUnsignedAccounts
    });

    swapTransaction.sign([userWallet]);

    const txid = await connection.sendTransaction(swapTransaction, {
      skipPreflight: false,
      maxRetries: 2
    });

    console.log('Transaction sent:', txid);

    await connection.confirmTransaction({
      signature: txid,
      blockhash: swapData.blockhash,
      lastValidBlockHeight: swapData.lastValidBlockHeight
    });

    console.log('Transaction confirmed:', txid);
    return txid;
  } catch (error) {
    console.error('Trade error:', error);
    logTradeError(error, 'jupiter_trade');
    throw error;
  }
}

function formatSuccessfulTrade(txHash: string, walletAddress: string, amount: number): string {
  return `
🎉 Trade Successful - Pump Science Wallet

💫 Transaction Details:
📍 Status: Confirmed
🔗 Network: Solana Mainnet
💰 Amount: ${amount} SOL

🔍 View Transaction:
https://solscan.io/tx/${txHash}

⚡ Transaction Hash:
\`${txHash}\`

👛 Wallet Information:
🔑 Address: \`${walletAddress}\`
🔍 View Wallet: https://solscan.io/account/${walletAddress}`;
}

function formatTradeError(error: any): string {
  if (error.message?.includes('insufficient funds')) {
    return `❌ Insufficient Funds - Pump Science Wallet
The transaction failed due to insufficient funds.
Please check your wallet balance and try again.`;
  }

  if (error.message?.includes('slippage')) {
    return `❌ Slippage Error - Pump Science Wallet
The price moved beyond the allowed slippage tolerance.
Please try again or increase slippage tolerance.`;
  }

  // Check if it's a timeout error
  if (error.name === 'AbortError' || error.message.includes('timeout')) {
    return `❌ Network Timeout - Pump Science Wallet
The request timed out. Please try again.

If the issue persists:
1️⃣ Check your internet connection
2️⃣ Try a smaller trade amount
3️⃣ Try again in a few minutes`;
  }

  // Check if amount is too small
  if (error.message === 'Amount too small') {
    return `❌ Invalid Amount - Pump Science Wallet
The trade amount is too small.
Minimum trade amount is 0.000001 SOL.

Please try again with a larger amount.`;
  }

  // Check if invalid token address
  if (error.message === 'Invalid token address') {
    return `❌ Invalid Token - Pump Science Wallet
The token address is not valid.
Please verify the token address and try again.`;
  }

  // If response contains "not found", it's likely an invalid token pair
  if (error.message.toLowerCase().includes('not found')) {
    return `❌ Invalid Token Pair - Pump Science Wallet
This token pair cannot be traded.
Please verify:
1️⃣ Both tokens exist on Solana
2️⃣ The token has liquidity on Jupiter
3️⃣ Try a different token`;
  }

  return `❌ Transaction Failed - Pump Science Wallet
The transaction could not be completed.
Please try again or contact support if the issue persists.

Error: ${error.message || 'Unknown error'}`;
}

function formatStartupWalletInfo(walletAddress: string): string {
  return `
⭐ Welcome to Pump Science Wallet!

Your Solana wallet has been created:
🔑 Address: \`${walletAddress}\`
🔍 View on Solscan: https://solscan.io/account/${walletAddress}

To start trading:
1️⃣ Copy your wallet address above
2️⃣ Send SOL to start trading
3️⃣ Use the menu below to trade tokens`;
}

function formatTradeInstructions(walletAddress: string): string {
  return `
💸 Trade Instructions - Pump Science Wallet

Your trading wallet:
🔑 Address: \`${walletAddress}\`
🔍 View on Solscan: https://solscan.io/account/${walletAddress}

To execute a trade on Solana Mainnet:
1️⃣ Enter the token's contract address
2️⃣ Choose the amount to trade
3️⃣ Confirm the transaction`;
}

function formatNetworkError(): string {
  return `❌ Network Error - Pump Science Wallet
Unable to connect to Solana network.
Please try again in a few moments.

If the issue persists:
1️⃣ Check your internet connection
2️⃣ Verify Solana network status
3️⃣ Contact support if needed`;
}

function formatInsufficientBalanceMessage(balance: number, walletAddress: string): string {
  return `❌ Insufficient Balance - Pump Science Wallet

💰 Current Balance: ${balance / LAMPORTS_PER_SOL} SOL
🔑 Wallet Address: \`${walletAddress}\`
🔍 View on Solscan: https://solscan.io/account/${walletAddress}

To trade on Solana Mainnet:
1️⃣ Copy your wallet address above
2️⃣ Send SOL to this address
3️⃣ Wait for transaction confirmation

Try again after adding funds.`;
}

function formatTradeErrorMessage(balance: number, required: number, walletAddress: string): string {
  return `❌ Insufficient Balance for Trade - Pump Science Wallet

💰 Required: ${required} SOL
💳 Available: ${balance / LAMPORTS_PER_SOL} SOL
🔑 Wallet Address: \`${walletAddress}\`
🔍 View on Solscan: https://solscan.io/account/${walletAddress}

Please add more funds or try a smaller amount.`;
}

function formatWalletInfo(balance: number, walletAddress: string): string {
  return `
🔍 Wallet Information - Pump Science Wallet

💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL
🔑 Address: \`${walletAddress}\`
🔍 View on Solscan: https://solscan.io/account/${walletAddress}`;
}

function formatTokenInfo(pair: any, address: string): string {
  return `
🔍 Token Information - Pump Science Wallet

📊 Symbol: ${pair.baseToken.symbol}
💲 Price: $${pair.priceUsd}
💰 Market Cap: $${pair.fdv || 'N/A'}
📈 24h Volume: $${pair.volume.h24}
📊 Price Change 24h: ${pair.priceChange.h24}%

💧 Liquidity: $${pair.liquidity.usd}
🏦 Dex: ${pair.dexId}

🔑 Contract Address: \`${address}\``;
}

function formatMainMenu(): string {
  return `🚀 Welcome to Pump Science Wallet! Choose an option:`;
}

function formatTokenNotFoundError(address: string): string {
  return `❌ Token Not Found - Pump Science Wallet

🔍 The token at address \`${address}\` was not found on any supported DEX.

Please verify:
1️⃣ The token address is correct
2️⃣ The token is traded on Jupiter/Raydium
3️⃣ The token has active liquidity`;
}

function formatInvalidAddressError(): string {
  return `❌ Invalid Address - Pump Science Wallet

Please provide a valid Solana token address:
1️⃣ Should be 32-44 characters long
2️⃣ Contains only base58 characters
3️⃣ No special characters or spaces`;
}

function formatApiError(): string {
  return `❌ Service Temporarily Unavailable - Pump Science Wallet

We're experiencing issues with our price feed.
Please try again in a few minutes.

If the issue persists, check:
1️⃣ Network connectivity
2️⃣ Token liquidity status
3️⃣ DEX API availability`;
}

function formatQuoteError(error: any): string {
  let errorMessage = '❌ Failed to get quote. Please try again.';

  if (error.message.includes('INSUFFICIENT_BALANCE')) {
    errorMessage = '❌ Insufficient balance for trade and fees.';
  } else if (error.message.includes('INVALID_AMOUNT')) {
    errorMessage = '❌ Invalid trade amount. Please try a different amount.';
  } else if (error.message.includes('NO_ROUTE_FOUND')) {
    errorMessage = '❌ No trading route found. This pair might not be tradeable.';
  }

  return errorMessage;
}

function formatTradeSummary(
  inputAmount: number,
  outputAmount: number,
  priceImpact: string | number,
  minOutputAmount: number,
  walletBalance: number,
  isSell: boolean = false
): string {
  const inputToken = isSell ? 'Token' : 'SOL';
  const outputToken = isSell ? 'SOL' : 'Token';
  
  return `💱 *Trade Summary*

*Input:* ${inputAmount} ${inputToken}
*Expected Output:* ${outputAmount} ${outputToken}
*Minimum Output:* ${minOutputAmount} ${outputToken}
*Price Impact:* ${typeof priceImpact === 'string' ? priceImpact : priceImpact.toFixed(2)}%
*Slippage Tolerance:* 0.5%

💰 *Wallet Balance:* ${(walletBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL

Please confirm if you want to proceed with this trade.`;
}

function getMainMenuButtons() {
  return {
    inline_keyboard: [
      [
        { text: '🛒 Buy', callback_data: 'buy' },
        { text: '💰 Sell', callback_data: 'sell' }
      ],
      [
        { text: '⏰ Limit Orders', callback_data: 'limit_orders' },
        { text: '📊 DCA', callback_data: 'dca' }
      ],
      [{ text: '👛 My Wallet', callback_data: 'my_wallet' }],
      [{ text: '⚙️ Settings', callback_data: 'settings' }],
      [
        { text: '📈 Positions', callback_data: 'positions' },
        { text: '👥 Referrals', callback_data: 'referrals' }
      ],
      [
        { text: '❓ Help', callback_data: 'help' },
        { text: '🔄 Refresh', callback_data: 'refresh' }
      ]
    ]
  };
}

function getTradeButtons(isToken: boolean, address: string) {
  if (isToken) {
    return {
      inline_keyboard: [
        [
          { text: '🔄 Sell 50%', callback_data: 'sell_50' },
          { text: '🔄 Sell 100%', callback_data: 'sell_100' }
        ]
      ]
    };
  }
  return {
    inline_keyboard: [
      [{ text: '💸 Enter amount in SOL', callback_data: `enter_amount:${address}` }]
    ]
  };
}

function getConfirmationButtons(quoteId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: `confirm_trade:${quoteId}` },
        { text: '❌ Cancel', callback_data: 'cancel_trade' }
      ]
    ]
  };
}

// Add this helper function to get token balance
async function getTokenBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  tokenMint: string
): Promise<number> {
  try {
    const tokenMintPubkey = new PublicKey(tokenMint);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { mint: tokenMintPubkey }
    );

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    // Get the balance from the first token account found
    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance;
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

// Constants
const CHANNEL_ID = process.env.CHANNEL_ID || '-1002476351876';
let messageInterval: NodeJS.Timeout | null = null;
let messageCount = 0; // Add counter for tracking messages

// Message sending function with enhanced logging
async function sendPeriodicMessage(bot: Telegraf<Context>) {
  try {
    // First, verify bot's access to channel
    console.log('🔍 Checking bot permissions for channel:', CHANNEL_ID);
    const chatMember = await bot.telegram.getChatMember(CHANNEL_ID, bot.botInfo!.id);
    console.log('Bot status in channel:', chatMember.status);

    const message = `🔔 PumpScience Test Message

🕒 Time: ${new Date().toLocaleString()}
🔄 Test Number: ${Math.floor(Math.random() * 100)}

This is a test message to verify bot functionality.`;

    console.log('Attempting to send message to channel:', CHANNEL_ID);
    
    const result = await bot.telegram.sendMessage(CHANNEL_ID, message);
    console.log('Message sent successfully:', result);

  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      description: error.description,
      channelId: CHANNEL_ID,
      botToken: process.env.TELEGRAM_BOT_TOKEN?.slice(0, 6) + '...'
    });
    throw error;
  }
}

// Function to start periodic messages with immediate first message
async function startPeriodicMessages(bot: Telegraf<Context>) {
  if (messageInterval) {
    clearInterval(messageInterval);
  }
  
  console.log('\n🚀 Starting periodic message service...');
  
  try {
    // Send first message immediately
    console.log('📬 Sending initial message...');
    await sendPeriodicMessage(bot);
    console.log('✅ Initial message sent successfully');
    
    // Schedule messages every 60 seconds
    messageInterval = setInterval(async () => {
      try {
        await sendPeriodicMessage(bot);
      } catch (error) {
        console.error('❌ Interval message error:', error);
      }
    }, 60000);
    
    console.log('⏰ Message interval set to 60 seconds');
  } catch (error) {
    console.error('❌ Failed to start periodic messages:', error);
    throw error;
  }
}

// Main bot initialization function
export async function initializeBot(connection: Connection): Promise<Telegraf<Context>> {
  console.log('🤖 Bot Starting...');
  
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
  const CHANNEL_ID = process.env.CHANNEL_ID || '-1002476351876';

  // Simple periodic message function
  async function sendMessage() {
    try {
      const message = `🚀 PumpScience Bot Test
      
Time: ${new Date().toLocaleString()}
Test ID: ${Math.floor(Math.random() * 1000)}`;

      console.log('Sending message to channel:', CHANNEL_ID);
      await bot.telegram.sendMessage(CHANNEL_ID, message);
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  // Send immediate test message
  console.log('Sending initial test message...');
  await sendMessage();

  // Set up interval (every 60 seconds)
  setInterval(sendMessage, 60000);

  console.log('Bot initialized successfully');
  return bot;
}

// Function to stop periodic messages
function stopPeriodicMessages() {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
    console.log('⏹️ Periodic messages stopped');
  }
}

// Add graceful shutdown handler
process.on('SIGINT', () => {
  console.log('\n👋 Gracefully shutting down...');
  stopPeriodicMessages();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Gracefully shutting down...');
  stopPeriodicMessages();
  process.exit(0);
});

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN);
bot.use((new LocalSession({ database: 'sessions.json' })).middleware());

bot.command('start', async (ctx) => {
  try {
    const startParam = ctx.message?.text?.substring(7);

    if (startParam) {
      const [action, address] = startParam.split('_');
      if (address && (action === 'buy' || action === 'sell')) {
        ctx.session = { tokenAddress: address };

        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
          const pair = data.pairs[0];
          const message = formatTokenInfo(pair, address);

          if (action === 'sell') {
            await ctx.reply(message, {
              parse_mode: 'Markdown',
              reply_markup: getTradeButtons(true, address)
            });
          } else {
            await ctx.reply(message, {
              parse_mode: 'Markdown',
              reply_markup: getTradeButtons(false, address)
            });
          }
        } else {
          await ctx.reply(formatTokenNotFoundError(address), { parse_mode: 'Markdown' });
        }
      } else {
        if (!ctx.session.wallet) {
          const wallet = Keypair.generate();
          ctx.session.wallet = {
            publicKey: wallet.publicKey.toString(),
            secretKey: Buffer.from(wallet.secretKey).toString('hex')
          };
        }

        const startupMessage = formatStartupWalletInfo(ctx.session.wallet.publicKey);
        await ctx.reply(startupMessage, {
          parse_mode: 'Markdown',
          reply_markup: getMainMenuButtons()
        });
      }
    } else {
      if (!ctx.session.wallet) {
        const wallet = Keypair.generate();
        ctx.session.wallet = {
          publicKey: wallet.publicKey.toString(),
          secretKey: Buffer.from(wallet.secretKey).toString('hex')
        };
      }

      const startupMessage = formatStartupWalletInfo(ctx.session.wallet.publicKey);
      await ctx.reply(startupMessage, {
        parse_mode: 'Markdown',
        reply_markup: getMainMenuButtons()
      });
    }
  } catch (error) {
    log(`Error in start command: ${error}`, "telegram");
  }
});

bot.action('buy', async (ctx: BotContext) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.wallet) {
      const wallet = Keypair.generate();
      ctx.session.wallet = {
        publicKey: wallet.publicKey.toString(),
        secretKey: Buffer.from(wallet.secretKey).toString('hex')
      };
    }

    const publicKey = new PublicKey(ctx.session.wallet.publicKey);
    const balance = await connection.getBalance(publicKey);

    if (balance <= 0) {
      await ctx.reply(formatInsufficientBalanceMessage(balance, ctx.session.wallet.publicKey),
        { parse_mode: 'Markdown' });
      return;
    }

    const message = formatWalletInfo(balance, ctx.session.wallet.publicKey) + `
📝 Please enter the token contract address to buy`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
    ctx.session.lastAction = 'buy';
  } catch (error) {
    log(`Error in buy action: ${error}`, "telegram");
    await ctx.reply('❌ Error checking wallet balance. Please try again - Pump Science Wallet');
  }
});

bot.action('sell', async (ctx: BotContext) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.wallet) {
      const wallet = Keypair.generate();
      ctx.session.wallet = {
        publicKey: wallet.publicKey.toString(),
        secretKey: Buffer.from(wallet.secretKey).toString('hex')
      };
    }

    const publicKey = new PublicKey(ctx.session.wallet.publicKey);
    const balance = await connection.getBalance(publicKey);

    if (balance <= 0) {
      await ctx.reply(formatInsufficientBalanceMessage(balance, ctx.session.wallet.publicKey), { parse_mode: 'Markdown' });
      return;
    }

    const message = formatWalletInfo(balance, ctx.session.wallet.publicKey) + `
📝 Please enter the token contract address to sell`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
    ctx.session.lastAction = 'sell';
  } catch (error) {
    log(`Error in sell action: ${error}`, "telegram");
    await ctx.reply('❌ Error checking wallet balance. Please try again - Pump Science Wallet');
  }
});

bot.action('my_wallet', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.wallet) {
      const wallet = Keypair.generate();
      ctx.session.wallet = {
        publicKey: wallet.publicKey.toString(),
        secretKey: Buffer.from(wallet.secretKey).toString('hex')
      };
    }

    const publicKey = new PublicKey(ctx.session.wallet.publicKey);
    const balance = await connection.getBalance(publicKey);

    const message = `
👛 Pump Science Wallet

${formatWalletInfo(balance, ctx.session.wallet.publicKey)}

📝 Note: Copy your wallet address above to deposit funds.`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    log(`Error in my_wallet action: ${error}`, "telegram");
    await ctx.reply('❌ Error fetching wallet information. Please try again - Pump Science Wallet');
  }
});

bot.action(/^confirm_trade:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    if (!ctx.session?.wallet) {
      await ctx.reply('❌ Wallet not found. Please restart the bot with /start');
      return;
    }

    if (!ctx.session?.tradeAmount) {
      await ctx.reply('❌ Trade amount not found. Please try again');
      return;
    }

    const userWallet = Keypair.fromSecretKey(
      Buffer.from(ctx.session.wallet.secretKey, 'hex')
    );

    const isSell = ctx.session.lastAction === 'sell';
    try {
      const txid = await executeJupiterTrade(
        userWallet,
        isSell ? ctx.session.tokenAddress! : 'So11111111111111111111111111111111111111112',
        isSell ? 'So11111111111111111111111111111111111111112' : ctx.session.tokenAddress!,
        ctx.session.tradeAmount,
        isSell
      );

      await ctx.reply(
        `✅ Trade executed successfully!\n\n` +
        `View on Solscan: https://solscan.io/tx/${txid}`
      );
    } catch (error) {
      let errorMessage = '❌ Trade failed. Please try again.';

      if (error.message.includes('INSUFFICIENT_BALANCE')) {
        errorMessage = isSell 
          ? '❌ Insufficient token balance for the trade.'
          : '❌ Insufficient SOL balance for the trade.';
      } else if (error.message.includes('TOKEN_APPROVAL_FAILED')) {
        errorMessage = '❌ Failed to approve token spending. Please try again.';
      } else if (error.message.includes('SWAP_ERROR')) {
        errorMessage = '❌ Swap failed. This could be due to price movement or insufficient liquidity.';
      } else if (error.message.includes('SIMULATION_FAILED')) {
        errorMessage = '❌ Transaction simulation failed. Please try a different amount.';
      }

      console.error('Detailed error:', error);
      await ctx.reply(errorMessage);
    }
  } catch (error) {
    console.error('Confirm trade error:', error);
    await ctx.reply('❌ An unexpected error occurred');
  }
});

bot.action(['sell_50', 'sell_100'], async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.wallet || !ctx.session.tokenAddress) {
      const error = new Error('Missing wallet or token address');
      logTradeError(error, 'sell_validation', {
        hasWallet: !!ctx.session.wallet,
        hasTokenAddress: !!ctx.session.tokenAddress
      });
      await ctx.reply('❌ Wallet or token not found. Please restart the bot - Pump Science Wallet');
      return;
    }

    const publicKey = new PublicKey(ctx.session.wallet.publicKey);
    console.log('👛 Checking balances for wallet:', publicKey.toString());

    const [solBalance, tokenBalance] = await Promise.all([
      connection.getBalance(publicKey),
      getTokenBalance(connection, publicKey, ctx.session.tokenAddress)
    ]);

    console.log('💰 Balances:', {
      sol: solBalance / LAMPORTS_PER_SOL,
      token: tokenBalance,
      tokenMint: ctx.session.tokenAddress
    });

    if (tokenBalance <= 0) {
      logTradeError(
        new Error('NO_TOKEN_BALANCE'),
        'token_balance_check',
        { tokenBalance, tokenMint: ctx.session.tokenAddress }
      );
      await ctx.reply('❌ No tokens found in your wallet to sell', { parse_mode: 'Markdown' });
      return;
    }

    const percentage = ctx.callbackQuery?.data?.includes('100') ? 100 : 50;
    const sellAmount = (tokenBalance * percentage) / 100;

    try {
      // Build quote URL with parameters
      const quoteUrl = new URL('https://public.jupiterapi.com/quote');
      quoteUrl.searchParams.append('inputMint', ctx.session.tokenAddress);
      quoteUrl.searchParams.append('outputMint', "So11111111111111111111111111111111111111112");
      quoteUrl.searchParams.append('amount', Math.floor(sellAmount * 1e9).toString());
      quoteUrl.searchParams.append('slippageBps', '50');
      quoteUrl.searchParams.append('onlyDirectRoutes', 'false');
      quoteUrl.searchParams.append('platformFeeBps', '0');

      console.log('Sell Quote Request:', quoteUrl.toString());
      const response = await fetch(quoteUrl.toString());

      if (!response.ok) {
        console.error('Sell Quote Error:', await response.text());
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const quote = await response.json();
      console.log('Sell Quote Response:', quote);

      // Store the sell amount in the session for the trade
      ctx.session.tradeAmount = sellAmount;

      const preConfirmationMessage = formatTradeSummary(
        sellAmount,
        Number(quote.outAmount) / 1e9,
        quote.priceImpactPct || 0,
        Number(quote.otherAmountThreshold) / 1e9,
        solBalance,
        true // isSell = true
      );

      await ctx.reply(preConfirmationMessage, {
        parse_mode: 'Markdown',
        reply_markup: getConfirmationButtons(quote.quoteMeta?.id || 'default')
      });
    } catch (error) {
      logTradeError(error, 'sell_quote_fetch');
      if (error.message.includes('HTTP error!')) {
        await ctx.reply('❌ Error fetching trade quote. The trading service is temporarily unavailable - Pump Science Wallet');
      } else {
        await ctx.reply('❌ Error calculating sell quote. Please try again - Pump Science Wallet');
      }
    }
  } catch (error) {
    logTradeError(error, 'sell_action');
    await ctx.reply('❌ An unexpected error occurred. Please try again - Pump Science Wallet');
  }
});

bot.on('text', async (ctx) => {
  const text = ctx.message?.text;
  if (!text) return;

  if (!ctx.session.wallet) {
    const wallet = Keypair.generate();
    ctx.session.wallet = {
      publicKey: wallet.publicKey.toString(),
      secretKey: Buffer.from(wallet.secretKey).toString('hex')
    };
  }

  // Check if this is a SOL amount input for trading
  if (ctx.session.tokenAddress && !isNaN(parseFloat(text))) {
    const amount = parseFloat(text);
    
    // Store the amount in the session
    ctx.session.tradeAmount = amount;

    // Get wallet balance
    const publicKey = new PublicKey(ctx.session.wallet.publicKey);
    const balance = await connection.getBalance(publicKey);

    if (balance <= 0) {
      await ctx.reply(formatInsufficientBalanceMessage(balance, ctx.session.wallet.publicKey), { parse_mode: 'Markdown' });
      return;
    }

    // Check if amount is greater than balance
    if (amount * LAMPORTS_PER_SOL > balance) {
      await ctx.reply(
        formatTradeErrorMessage(balance, amount, ctx.session.wallet.publicKey),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Validate token address
      try {
        new PublicKey(ctx.session.tokenAddress);
      } catch (e) {
        await ctx.reply(formatInvalidAddressError(), { parse_mode: 'Markdown' });
        return;
      }

      const quote = await getJupiterQuote(
        "So11111111111111111111111111111111111111112", // SOL mint
        ctx.session.tokenAddress,
        amount
      );

      const preConfirmationMessage = formatTradeSummary(
        amount,
        Number(quote.outAmount) / LAMPORTS_PER_SOL,
        quote.priceImpactPct || 0,
        Number(quote.otherAmountThreshold || 0) / LAMPORTS_PER_SOL,
        balance
      );

      await ctx.reply(preConfirmationMessage, {
        parse_mode: 'Markdown',
        reply_markup: getConfirmationButtons(quote.quoteMeta?.id || 'default')
      });
    } catch (error) {
      logTradeError(error, 'quote_fetch');
      await ctx.reply(formatQuoteError(error), { parse_mode: 'Markdown' });
    }
    return;
  } else if (text.length >= 32 && text.length <= 44) {
    try {
      // Validate token address first
      try {
        new PublicKey(text);
      } catch (e) {
        await ctx.reply(formatInvalidAddressError(), { parse_mode: 'Markdown' });
        return;
      }

      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${text}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        const message = formatTokenInfo(pair, text);
        ctx.session.tokenAddress = text;

        if (ctx.session.lastAction === 'sell') {
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: getTradeButtons(true, text)
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: getTradeButtons(false, text)
          });
        }
      } else {
        await ctx.reply(formatTokenNotFoundError(text), { parse_mode: 'Markdown' });
      }
    } catch (error) {
      logTradeError(error, 'token_info_fetch');
      await ctx.reply(formatApiError(), { parse_mode: 'Markdown' });
    }
  } else {
    await ctx.reply(formatInvalidAddressError(), { parse_mode: 'Markdown' });
  }
});

bot.action(/^enter_amount:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData) return;

    const match = callbackData.match(/^enter_amount:(.+)$/);
    const address = match?.[1];
    if (!address) return;

    ctx.session.tokenAddress = address;
    await ctx.reply('Please enter the amount in SOL you want to spend on this token');
  } catch (error) {
    logTradeError(error, 'enter_amount');
    await ctx.reply('An error occurred while processing your request. Please try again.');
  }
});

bot.launch().then(() => {
  log('Telegram bot started successfully', 'telegram');
}).catch((error) => {
  log('Failed to start Telegram bot: ' + error, 'telegram');
});

// Add this command to manually test message sending
bot.command('testmessage', async (ctx) => {
  try {
    await sendPeriodicMessage(ctx.telegram);
    await ctx.reply('Test message sent to channel');
  } catch (error) {
    console.error('Test message failed:', error);
    await ctx.reply('Failed to send test message: ' + error.message);
  }
});