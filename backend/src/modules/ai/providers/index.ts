import { aiProviderRegistry } from '../ai-provider.registry.js';
import { env } from '../../../config/env.js';
import { OpenAiReviewIntelligenceProvider } from './openai-review-intelligence.provider.js';
import { MistralReviewIntelligenceProvider } from './mistral-review-intelligence.provider.js';
import { SelfHostedReviewIntelligenceProvider } from './self-hosted-review-intelligence.provider.js';

let registered = false;

export function registerAiProviders() {
  if (registered) return;
  aiProviderRegistry.register(new OpenAiReviewIntelligenceProvider(), { active: env.AI_PROVIDER === 'openai' });
  aiProviderRegistry.register(new MistralReviewIntelligenceProvider(), { active: env.AI_PROVIDER === 'mistral' });
  aiProviderRegistry.register(new SelfHostedReviewIntelligenceProvider(), { active: env.AI_PROVIDER === 'self_hosted' });
  registered = true;
}
