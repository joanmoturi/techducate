// Integrations are deliberately unavailable until an approved provider is implemented.
export interface PaymentProvider {
  initiate(input: {
    reference: string
    amountMinor: number
    currency: string
  }): Promise<{ redirectUrl: string }>
  verifyCallback(
    payload: unknown,
    signature: string,
  ): Promise<{
    reference: string
    status: 'verified' | 'failed'
    amountMinor: number
    currency: string
  }>
}
export interface NotificationProvider {
  send(input: {
    recipient: string
    subject: string
    body: string
  }): Promise<{ providerReference: string }>
}
export interface LearningAssistant {
  draft(input: {
    subject: string
    ageBand: string
  }): Promise<{ draft: string; requiresReview: true }>
}
export const integrationStatus = {
  payments: { enabled: false, description: 'Manual follow-up only. No online payment processing.' },
  email: { enabled: false, description: 'Submissions are stored. No email is sent.' },
  sms: { enabled: false, description: 'Not configured.' },
  ai: { enabled: false, description: 'No external AI provider is connected.' },
} as const
