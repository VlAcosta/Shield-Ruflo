export type CreateProviderPaymentInput = {
  idempotencyKey: string;
  localPaymentId: string;
  organizationId: string;
  amountCents: number;
  currency: 'RUB';
  description: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  metadata: Record<string, string>;
};

export type ProviderPayment = {
  id: string;
  status: string;
  paid: boolean;
  amountCents: number;
  currency: string;
  confirmationUrl: string | null;
  test: boolean;
  metadata: Record<string, string>;
};

export interface BillingProvider {
  readonly id: string;
  readonly configured: boolean;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
}
