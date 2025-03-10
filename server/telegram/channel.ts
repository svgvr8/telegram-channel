import { Context, Telegraf } from 'telegraf';
import nodeHtmlToImage from 'node-html-to-image';
import { getRifCardHTML } from '../templates/rifCard';

export class ChannelManager {
  private channelId: string;
  private messageCount: number;
  private messageInterval: NodeJS.Timeout | null;
  private isLongCard: boolean; // Track which image to show

  constructor(channelId: string) {
    this.channelId = channelId;
    this.messageCount = 0;
    this.messageInterval = null;
    this.isLongCard = true; // Start with the long card
  }

  private async generateCardImage(isLongCard: boolean) {
    const data = {
      price: '$0.00042',
      marketCap: '$3.5M',
      change24h: '32.87'
    };

    const html = getRifCardHTML(data);
    
    const image = await nodeHtmlToImage({
      html,
      quality: 100,
      type: 'png',
      puppeteerArgs: {
        args: ['--no-sandbox']
      },
      selector: '.card'
    });

    return image;
  }

  async sendPeriodicMessage(bot: Telegraf<Context>) {
    try {
      this.messageCount++;

      // Generate card image
      const cardImage = await this.generateCardImage(this.isLongCard);

      const message = await bot.telegram.sendPhoto(this.channelId, {
        source: cardImage as Buffer
      }, {
        caption: '💊 Rifampicin ($RIF)\nA Life Extension Token on Wormhole',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🌐 RIF on Pump.Science',
                url: 'https://pump.science/experiments/RIF?mint=GJtJuWD9qYcCkrwMBmtY1tpapV1sKfB2zUv9Q4aqpump'              }
            ],
            [
              {
                text: '📊 RIF on Telegram',
                url: 'https://t.me/newspumpsciencebot?start=buy_GJtJuWD9qYcCkrwMBmtY1tpapV1sKfB2zUv9Q4aqpump'              }
            ]
          ]
        }
      });

      // Toggle for next message
      this.isLongCard = !this.isLongCard;

      console.log('✅ Message sent successfully:', {
        messageId: message.message_id,
        messageCount: this.messageCount,
        imageType: this.isLongCard ? 'long card' : 'short card',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error sending message:', {
        messageCount: this.messageCount,
        channelId: this.channelId,
        error: error.message
      });
      throw error;
    }
  }

  async startPeriodicMessages(bot: Telegraf<Context>) {
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
    }

    console.log('🚀 Starting periodic messages...');
    
    try {
      // Send first message immediately
      await this.sendPeriodicMessage(bot);
      
      // Set up interval for subsequent messages
      this.messageInterval = setInterval(async () => {
        try {
          await this.sendPeriodicMessage(bot);
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

  stopPeriodicMessages() {
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
      this.messageInterval = null;
      console.log('⏹️ Periodic messages stopped');
    }
  }
} 