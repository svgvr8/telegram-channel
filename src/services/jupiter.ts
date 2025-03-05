import { QuoteGetRequest, QuoteResponse, createJupiterApiClient, ResponseError } from '@jup-ag/api';

export class JupiterService {
  private readonly jupiterApi;

  constructor() {
    const ENDPOINT = 'https://public.jupiterapi.com';
    const CONFIG = { basePath: ENDPOINT };
    this.jupiterApi = createJupiterApiClient(CONFIG);
  }

  async getQuote({
    inputMint,
    outputMint,
    amount,
  }: {
    inputMint: string;
    outputMint: string;
    amount: number;
  }): Promise<QuoteResponse> {
    try {
      console.log('Getting quote with params:', {
        inputMint,
        outputMint,
        amount,
      });

      const quoteRequest: QuoteGetRequest = {
        inputMint,
        outputMint,
        amount,
      };

      console.log('Quote Request:', quoteRequest);

      const quote = await this.jupiterApi.quoteGet(quoteRequest);
      
      if (!quote) {
        throw new Error('No quote found');
      }

      console.log('Raw quote data:', JSON.stringify(quote, null, 2));
      
      console.log('Quote Response:', quote);

      // Calculate price from the quote data
      const inAmount = Number(quote.inAmount);
      const outAmount = Number(quote.outAmount);
      const price = outAmount / inAmount;

      console.log('Processed quote data:', {
        inAmount,
        outAmount,
        price,
        priceImpact: quote.priceImpactPct,
      });

      return {
        ...quote,
        price,
      };
    } catch (error) {
      if (error instanceof ResponseError) {
        console.error('Jupiter API error:', await error.response.json());
      } else {
        console.error('Error getting quote:', error);
      }
      throw error;
    }
  }
} 