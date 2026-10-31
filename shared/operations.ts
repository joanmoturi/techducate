import { z } from 'zod'
import { text, optionalText } from './domain.ts'

export const permissions = ['safeguarding', 'finance-approver'] as const
export const consentPurposes = ['participation', 'communications', 'media'] as const
export const concernStatuses = [
  'new',
  'triaged',
  'investigating',
  'referred',
  'resolved',
  'closed',
] as const
export const providerStages = [
  'applied',
  'review',
  'interview',
  'screening',
  'approved',
  'orientation',
  'active',
  'completed',
  'departed',
] as const
export const locationSchema = z.object({
  name: text(160),
  kind: z.enum(['school', 'community-centre', 'partner', 'venue', 'outreach', 'virtual']),
  area: optionalText(160),
  active: z.boolean().default(true),
})
export const operationsSchema = z
  .object({
    noticeVersion: text(60).default('participation-v1'),
    participationNotice: text(3000).default(
      'Participation is subject to eligibility review. A safeguarding officer must verify a parent or legal guardian’s authority and informed permission before a child participates. Permission can be withdrawn from this account.',
    ),
    communicationsNotice: text(1500).default(
      'Optional programme announcements are delivered to this adult account only. No private messaging with children is provided.',
    ),
    mediaNotice: text(1500).default(
      'Optional permission for photographs, video and publicity must be separately explained and verified. This platform does not publish child photographs. Refusing media permission does not prevent participation.',
    ),
    emergencyRequired: z.boolean().default(false),
    screeningRequired: z.boolean().default(false),
    locationId: z.uuid().nullable().default(null),
    participantTarget: z.number().int().min(0).max(1000000).default(0),
    beneficiaryGroup: optionalText(200),
    objectives: optionalText(3000),
    challenges: optionalText(3000),
    nextSteps: optionalText(3000),
    readiness: z
      .array(
        z.object({
          key: text(60),
          title: text(160),
          requiredBefore: z.enum(['none', 'open', 'running']),
          complete: z.boolean(),
          evidence: optionalText(500),
        }),
      )
      .max(30)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.readiness.map((r) => r.key)).size !== v.readiness.length)
      ctx.addIssue({
        code: 'custom',
        path: ['readiness'],
        message: 'Checklist keys must be unique.',
      })
    for (const [i, r] of v.readiness.entries())
      if (r.complete && !r.evidence)
        ctx.addIssue({
          code: 'custom',
          path: ['readiness', i, 'evidence'],
          message: 'Record how this item was checked.',
        })
  })
export const guardianSchema = z.object({
  relationship: z.enum(['parent', 'legal-guardian']),
  emergencyName: optionalText(120),
  emergencyPhone: optionalText(40),
})
export const consentSchema = z.object({
  purpose: z.enum(consentPurposes),
  granted: z.boolean(),
  noticeVersion: text(60),
})
export const consentVerificationSchema = z.object({
  evidenceReference: text(300),
  validUntil: z.string().datetime({ offset: true }),
  authorityConfirmed: z.literal(true),
})
export const concernSchema = z.object({
  programmeId: z.uuid().nullable().default(null),
  subject: text(160),
  detail: text(8000),
  priority: z.enum(['normal', 'urgent']),
})
export const concernActionSchema = z.object({
  status: z.enum(concernStatuses),
  note: text(5000),
  assignedTo: z.uuid().nullable(),
  reviewDue: z.string().datetime({ offset: true }).nullable(),
  retainUntil: z.string().datetime({ offset: true }),
  legalHold: z.boolean(),
})
export const providerSchema = z.object({
  stage: z.enum(providerStages),
  engagement: z.enum(['volunteer', 'paid', 'part-time', 'contractor']),
  applicationId: z.uuid().nullable().default(null),
  skills: optionalText(1500),
  interests: optionalText(1500),
  availability: optionalText(500),
  orientationComplete: z.boolean(),
  feedback: optionalText(1500),
})
export const screeningSchema = z
  .object({
    status: z.enum(['pending', 'cleared', 'failed', 'expired']),
    validUntil: z.string().datetime({ offset: true }).nullable().default(null),
    trainingDate: z.string().date().nullable().default(null),
    acknowledgementVersion: optionalText(80),
    evidenceReference: text(300),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'cleared' && (!v.validUntil || !v.trainingDate || !v.acknowledgementVersion))
      ctx.addIssue({
        code: 'custom',
        message:
          'Cleared providers require a training date, acknowledged code version and clearance expiry.',
      })
  })
export const agreementSchema = z.object({
  arrangement: text(2000),
  amountMinor: z.number().int().min(0).max(1000000000),
  currency: z.string().regex(/^[A-Z]{3}$/),
})
export const contributionSchema = z.object({
  programmeId: z.uuid(),
  userId: z.uuid(),
  date: z.string().date(),
  minutes: z.number().int().min(1).max(1440),
  activity: text(1000),
})
export const sourceSchema = z.object({
  name: text(160),
  kind: z.enum([
    'individual',
    'corporate',
    'institutional',
    'foundation',
    'grant-provider',
    'in-kind',
  ]),
  contact: optionalText(300),
})
export const awardSchema = z.object({
  sourceId: z.uuid(),
  donationId: z.uuid().nullable().default(null),
  reference: text(160).transform((v) => v.toUpperCase()),
  title: text(200),
  kind: z.enum(['donation', 'grant', 'in-kind']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  pledgedMinor: z.number().int().min(0).max(1000000000),
  restrictedProgrammes: z.array(z.uuid()).max(100).default([]),
  applicationStatus: z.enum(['not-applicable', 'preparing', 'submitted', 'awarded', 'declined']),
  awardDate: z.string().date().nullable().default(null),
  reportingDue: z.string().date().nullable().default(null),
  conditions: optionalText(3000),
  inKindDescription: optionalText(2000),
})
export const financialActionSchema = z
  .object({
    awardId: z.uuid(),
    programmeId: z.uuid().nullable().default(null),
    kind: z.enum(['receipt', 'allocate', 'release', 'expenditure']),
    amountMinor: z
      .number()
      .int()
      .min(-1000000000)
      .max(1000000000)
      .refine((v) => v !== 0, 'Amount cannot be zero.'),
    reference: text(160).transform((v) => v.toUpperCase()),
    reason: text(1000),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== 'receipt' && (!v.programmeId || v.amountMinor < 0))
      ctx.addIssue({
        code: 'custom',
        path: ['amountMinor'],
        message: 'Allocations, releases and expenditure need a programme and positive amount.',
      })
    if (v.kind === 'receipt' && v.programmeId)
      ctx.addIssue({
        code: 'custom',
        path: ['programmeId'],
        message: 'Receipts belong to a funding award, not a programme.',
      })
  })
export const indicatorSchema = z.object({
  name: text(160),
  kind: z.enum(['output', 'outcome']),
  unit: text(80),
  target: z.number().min(0).max(1000000000),
  evidenceRequirement: text(500),
})
export const observationSchema = z.object({
  value: z.number().min(0).max(1000000000),
  observedAt: z.string().date(),
  evidenceReference: text(300),
  note: optionalText(1500),
})
export interface Operations extends z.infer<typeof operationsSchema> {}
export interface Location extends z.infer<typeof locationSchema> {
  id: string
}
export interface ProviderProfile extends z.infer<typeof providerSchema> {}
export interface Screening extends z.infer<typeof screeningSchema> {}
export interface Provider {
  id: string
  name: string
  role: string
  profile: ProviderProfile | null
  screening?: Screening | null
  eligible: boolean
  agreement?: z.infer<typeof agreementSchema> | null
}
export interface ConsentRecord {
  id: string
  purpose: string
  granted: number
  notice_version: string
  declared_at: string
  verified_at: string | null
  valid_until: string | null
}
export interface ConsentCase {
  applicationId: string
  participantName: string
  programmeId: string
  title: string
  ageBand: string
  guardianName: string
  guardianEmail: string
  guardian: z.infer<typeof guardianSchema> | null
  policy: Pick<
    Operations,
    | 'noticeVersion'
    | 'participationNotice'
    | 'communicationsNotice'
    | 'mediaNotice'
    | 'emergencyRequired'
  >
  consents: ConsentRecord[]
  participationReady: boolean
}
export interface Concern {
  id: string
  subject: string
  detail: string
  priority: string
  status: string
  assigned_to: string | null
  review_due: string | null
  retain_until: string
  legal_hold: number
  created_at: string
  actions: { status: string; note: string; created_at: string }[]
}
export interface FundingAward extends z.infer<typeof awardSchema> {
  id: string
  receivedMinor: number
  allocatedMinor: number
  spentMinor: number
}
export interface FinancialAction extends z.infer<typeof financialActionSchema> {
  id: string
  proposed_by: string
  status: string
  reviewed_by: string | null
  created_at: string
  reviewed_at: string | null
}
export interface Indicator extends z.infer<typeof indicatorSchema> {
  id: string
  observations: (z.infer<typeof observationSchema> & { id: string; verified: boolean })[]
}
export interface ImpactRow {
  programmeId: string
  title: string
  overview: string
  location: string
  category: string
  period: string
  planned: number
  applications: number | null
  approvedPlaces: number | null
  attendedPlaces: number | null
  lessonCompletions: number | null
  projects: number | null
  scholarships: number | null
  objectives: string
  beneficiaryGroup: string
  challenges: string
  nextSteps: string
  indicators: { name: string; kind: string; unit: string; target: number; value: number | null }[]
  funding?: {
    currency: string
    receivedMinor: number
    approvedBudgetMinor: number
    allocatedMinor: number
    spentMinor: number
  }[]
}
