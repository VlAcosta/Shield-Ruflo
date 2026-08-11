export type ProviderCapability =
  | 'oauth'
  | 'accounts.read'
  | 'locations.read'
  | 'profile.read'
  | 'reviews.read'
  | 'reviews.reply';

export type ProviderAvailability = {
  configured: boolean;
  connectable: boolean;
  reasonCode?: string | undefined;
  reasonMessage?: string | undefined;
};

export type ProviderConnectionContext = {
  organizationId: string;
  accountId: string;
  provider: string;
  externalAccountId: string | null;
  configuration: Record<string, unknown>;
  credentials: Readonly<Record<string, string>>;
};

export type ProviderConnectResult = {
  verified: true;
  health: 'CONNECTED' | 'DEGRADED';
  externalAccountId?: string | undefined;
  configuration?: Record<string, unknown> | undefined;
  validatedAt?: Date | undefined;
};

export type ProviderDisconnectResult = {
  confirmed: boolean;
};

export type ProviderReviewRecord = {
  externalId: string;
  rating: number;
  text?: string | undefined;
  authorName?: string | undefined;
  authorExternalId?: string | undefined;
  authorAvatarUrl?: string | undefined;
  authorProfileUrl?: string | undefined;
  publishedAt: Date;
  providerUpdatedAt?: Date | undefined;
  providerLocationId?: string | undefined;
  providerLocationName?: string | undefined;
  sourceUrl?: string | undefined;
  raw?: Record<string, unknown> | undefined;
};

export type ProviderReviewSyncResult = {
  reviews: ProviderReviewRecord[];
  nextCursor?: string | undefined;
  hasMore: boolean;
};

export type ProviderReplyInput = {
  reviewReference: string;
  text: string;
};

export type ProviderReplyResult = {
  status: 'CONFIRMED' | 'UNKNOWN';
  externalReplyId?: string | undefined;
  providerState?: string | undefined;
  policyViolation?: unknown;
};

export type ProviderReplyReconciliationResult = {
  status: 'CONFIRMED' | 'ABSENT' | 'UNKNOWN';
  externalReplyId?: string | undefined;
  providerState?: string | undefined;
  policyViolation?: unknown;
};

export interface ProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly ProviderCapability[];
  availability(): ProviderAvailability;
  connect(context: ProviderConnectionContext): Promise<ProviderConnectResult>;
  disconnect?(context: ProviderConnectionContext): Promise<ProviderDisconnectResult>;
  syncReviews?(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult>;
  publishReply?(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyResult>;
  reconcileReply?(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyReconciliationResult>;
}

export type ProviderCatalogItem = {
  id: string;
  displayName: string;
  capabilities: readonly ProviderCapability[];
  availability: ProviderAvailability;
};
