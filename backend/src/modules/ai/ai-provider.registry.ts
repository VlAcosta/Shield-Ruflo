import type { AiReviewIntelligenceProvider } from './ai-provider.types.js';

class AiProviderRegistry {
  private readonly providers = new Map<string, AiReviewIntelligenceProvider>();
  private activeId: string | null = null;

  register(provider: AiReviewIntelligenceProvider, options: { active?: boolean } = {}) {
    this.providers.set(provider.id, provider);
    if (options.active || !this.activeId) this.activeId = provider.id;
  }

  active(): AiReviewIntelligenceProvider | null {
    return this.activeId ? this.providers.get(this.activeId) ?? null : null;
  }

  get(id: string): AiReviewIntelligenceProvider | null {
    return this.providers.get(id) ?? null;
  }

  clearForTests() {
    this.providers.clear();
    this.activeId = null;
  }
}

export const aiProviderRegistry = new AiProviderRegistry();
