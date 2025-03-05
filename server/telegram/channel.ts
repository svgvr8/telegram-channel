import { Context, Telegraf } from 'telegraf';

// Constants
const CHANNEL_ID = process.env.CHANNEL_ID || '-1002476351876';
let messageCount = 0;

export async function sendChannelMessage(bot: Telegraf<Context>) {
  try {
    messageCount++;
    const timestamp = new Date().toLocaleString();

    const message = `🚀 PumpScience Update #${messageCount}
    
💹 Market Activity:
• 24h Volume: $${(Math.random() * 1000000).toFixed(2)}
• Active Traders: ${Math.floor(Math.random() * 1000)}

📊 Recent Performance:
• Trades Executed: ${Math.floor(Math.random() * 100)}
• Success Rate: ${(Math.random() * 20 + 80).toFixed(1)}%

⏰ ${timestamp}`;

    console.log('📤 Sending message to channel:', {
      channelId: CHANNEL_ID,
      messageNumber: messageCount,
      timestamp
    });

    const result = await bot.telegram.sendMessage(CHANNEL_ID, message);
    
    console.log('✅ Message sent successfully:', {
      messageId: result.message_id,
      messageNumber: messageCount,
      timestamp
    });

    return result;
  } catch (error) {
    console.error('❌ Channel message error:', {
      error: error.message,
      channelId: CHANNEL_ID,
      messageNumber: messageCount
    });
    throw error;
  }
}

export function startPeriodicMessages(bot: Telegraf<Context>) {
  console.log('🚀 Starting periodic channel messages');

  // Send first message immediately
  sendChannelMessage(bot)
    .catch(error => console.error('Initial message failed:', error));

  // Set up interval for periodic messages
  const interval = setInterval(() => {
    sendChannelMessage(bot)
      .catch(error => console.error('Periodic message failed:', error));
  }, 60000);

  // Return interval for cleanup
  return interval;
} 