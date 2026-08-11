import { aiProviderRegistry } from '../ai-provider.registry.js';
import { OpenAiReviewIntelligenceProvider } from './openai-review-intelligence.provider.js';

let registered = false;

export function registerAiProviders() {
  if (registered) return;
  aiProviderRegistry.register(new OpenAiReviewIntelligenceProvider(), { active: true });
  registered = true;
}
