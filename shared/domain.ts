import { z } from 'zod'

export const roles = ['admin', 'manager', 'finance', 'instructor', 'learner', 'partner'] as const
export const programmeTypes = [
  'course',
  'bootcamp',
  'workshop',
  'outreach',
  'hackathon',
  'competition',
] as const
export const fundingModes = [
  'free',
  'paid',
  'sponsored',
  'scholarship',
  'subsidised',
  'partner',
  'invitation',
  'application',
] as const
export const programmeStatuses = [
  'draft',
  'scheduled',
  'open',
  'full',
  'running',
  'closed',
  'completed',
  'archived',
] as const
export const enquiryStatuses = [
  'new',
  'under-review',
  'follow-up',
  'discussion',
  'proposal-preparation',
  'proposal-sent',
  'accepted',
  'declined',
  'completed',
  'closed',
] as const
export const donationStatuses = [
  'pending',
  'received',
  'verified',
  'allocated',
  'declined',
] as const
export const volunteerStatuses = [
  'new',
  'under-review',
  'screening',
  'accepted',
  'declined',
  'closed',
] as const
export const ageBands = ['6-12', '13-17', '18+'] as const
export const staffRoles = ['instructor', 'mentor', 'judge', 'facilitator'] as const
export const text = (max = 200) => z.string().trim().min(1, 'This field is required.').max(max)
export const optionalText = (max = 2000) => z.string().trim().max(max).default('')
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase())
const date = z.string().datetime({ offset: true }).nullable().default(null)
const httpsUrl = z.union([
  z.literal(''),
  z
    .url()
    .max(2000)
    .refine((value) => new URL(value).protocol === 'https:', 'Use an HTTPS link.'),
])
export const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128)
export const registerSchema = z.object({
  name: text(80),
  email,
  password: passwordSchema,
  adult: z.literal(true, { error: 'An adult must create and manage this account.' }),
})
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) })
export const settingsSchema = z.object({
  contactEmail: z.union([z.literal(''), email]).default(''),
  contactLocation: optionalText(150),
  donationInstructions: optionalText(4000),
  legalName: optionalText(200),
  privacyContact: z.union([z.literal(''), email]).default(''),
  retentionDays: z.number().int().min(30).max(3650).default(365),
  safeguardingInstructions: optionalText(4000),
})
export const fundingSchema = z
  .object({
    mode: z.enum(fundingModes),
    capacity: z.number().int().min(0).max(10000),
    feeMinor: z.number().int().min(0).max(100000000).default(0),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
      .default('KES'),
    sponsor: optionalText(200),
    committedMinor: z.number().int().min(0).max(1000000000).default(0),
    receivedMinor: z.number().int().min(0).max(1000000000).default(0),
    budgetMinor: z.number().int().min(0).max(1000000000).default(0),
    awardMinor: z.number().int().min(0).max(100000000).default(0),
  })
  .superRefine((value, ctx) => {
    if (!['paid', 'subsidised'].includes(value.mode) && value.feeMinor !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['feeMinor'],
        message: 'Only paid and subsidised places may charge a fee.',
      })
    if (['paid', 'subsidised'].includes(value.mode) && value.feeMinor === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['feeMinor'],
        message: 'Paid and subsidised places need a fee.',
      })
  })
export const eventSchema = z.object({
  teamsEnabled: z.boolean().default(false),
  teamSize: z.number().int().min(1).max(20).default(4),
  deadline: date,
  challenge: optionalText(5000),
  rules: optionalText(5000),
  criteria: z
    .array(z.object({ name: text(100), maxScore: z.number().int().min(1).max(100) }))
    .max(10)
    .default([]),
  resultsPublished: z.boolean().default(false),
})
export const programmeSchema = z
  .object({
    title: text(150),
    summary: text(400),
    description: text(12000),
    type: z.enum(programmeTypes),
    topic: z.enum(['digital-literacy', 'coding', 'ai', 'robotics', 'web', 'innovation']),
    audience: z.enum(['all', 'children', 'youth', 'adults']),
    experience: text(150).default('No prior experience needed'),
    delivery: z.enum(['in-person', 'virtual', 'hybrid']),
    location: optionalText(200),
    objectives: optionalText(4000),
    eligibility: optionalText(4000),
    status: z.enum(programmeStatuses).default('draft'),
    publishAt: date,
    registrationOpens: date,
    registrationCloses: date,
    startsAt: date,
    endsAt: date,
    waitlist: z.boolean().default(true),
    funding: z.array(fundingSchema).min(1).max(fundingModes.length),
    event: eventSchema.default({
      teamsEnabled: false,
      teamSize: 4,
      deadline: null,
      challenge: '',
      rules: '',
      criteria: [],
      resultsPublished: false,
    }),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.funding.map((f) => f.mode)).size !== value.funding.length)
      ctx.addIssue({
        code: 'custom',
        path: ['funding'],
        message: 'Each funding mode may appear only once.',
      })
    if (value.funding.reduce((sum, f) => sum + f.capacity, 0) < 1)
      ctx.addIssue({ code: 'custom', path: ['funding'], message: 'Configure at least one place.' })
    for (const [start, end] of [
      [value.registrationOpens, value.registrationCloses],
      [value.startsAt, value.endsAt],
    ]) {
      if (start && end && Date.parse(start) >= Date.parse(end))
        ctx.addIssue({ code: 'custom', message: 'End dates must be after start dates.' })
    }
  })
export const applicationSchema = z
  .object({
    mode: z.enum(fundingModes),
    participantName: text(80),
    ageBand: z.enum(ageBands),
    motivation: optionalText(2000),
    guardianName: optionalText(100),
    guardianEmail: z.union([z.literal(''), email]).default(''),
    guardianConsent: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.ageBand !== '18+' && (!v.guardianName || !v.guardianEmail || !v.guardianConsent))
      ctx.addIssue({
        code: 'custom',
        path: ['guardianConsent'],
        message:
          'A guardian name, email and consent declaration are required. Staff must verify consent before access.',
      })
  })
export const publicFormSchema = z
  .object({
    kind: z.enum(['contact', 'volunteer', 'donation', 'partner']),
    name: text(100),
    email,
    message: text(5000),
    consent: z.literal(true, { error: 'Please acknowledge the privacy notice.' }),
    website: z.string().max(200).default(''),
    organisation: optionalText(200),
    organisationType: optionalText(150),
    service: optionalText(200),
    participants: optionalText(300),
    delivery: optionalText(150),
    location: optionalText(200),
    timeframe: optionalText(200),
    budget: optionalText(200),
    collaboration: optionalText(200),
    skills: optionalText(1500),
    interests: optionalText(1500),
    availability: optionalText(500),
    experience: optionalText(2000),
    donationType: z
      .enum(['money', 'equipment', 'connectivity', 'materials', 'other'])
      .default('money'),
    amountMinor: z.number().int().min(0).max(1000000000).default(0),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('KES'),
    purpose: optionalText(300),
    reference: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'partner' && (!v.organisation || !v.service || !v.participants))
      ctx.addIssue({
        code: 'custom',
        path: ['organisation'],
        message: 'Organisation, service and intended participants are required.',
      })
    if (v.kind === 'volunteer' && (!v.skills || !v.availability || !v.interests))
      ctx.addIssue({
        code: 'custom',
        path: ['skills'],
        message: 'Interests, skills and availability are required.',
      })
  })
export const lessonSchema = z.object({
  title: text(200),
  module: text(150),
  body: text(30000),
  position: z.number().int().min(0).max(1000),
  published: z.boolean(),
})
export const scheduleSchema = z
  .object({
    title: text(150),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    location: optionalText(300),
    joiningUrl: httpsUrl.default(''),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), 'End time must follow start time.')
export const projectSchema = z.object({
  title: text(200),
  description: text(10000),
  url: httpsUrl.refine((value) => value.length > 0, 'A project link is required.'),
})
export interface User {
  id: string
  name: string
  email: string
  role: (typeof roles)[number]
  permissions?: ('safeguarding' | 'finance-approver')[]
}
export interface Funding extends z.infer<typeof fundingSchema> {
  approved?: number
  allocatedMinor?: number
}
export interface Programme extends Omit<z.infer<typeof programmeSchema>, 'funding'> {
  id: string
  funding: Funding[]
  enrolled: number
  capacity: number
}
export type ProgrammeInput = z.infer<typeof programmeSchema>
export type SiteSettings = z.infer<typeof settingsSchema>
export type PublicSubmission = z.infer<typeof publicFormSchema>
export interface Application extends z.infer<typeof applicationSchema> {
  id: string
  programmeId: string
  userId: string
  status: string
  consentVerified: boolean
  paymentStatus: string
  paymentReference: string
  notes: string
  title: string
  email?: string
  createdAt: string
}
export interface Enquiry {
  id: string
  kind: PublicSubmission['kind']
  data: PublicSubmission
  status: string
  notes: string
  assignedTo: string | null
  programmeId: string | null
  createdAt: string
  receivedAmountMinor?: number
  receiptCurrency?: string
  receiptReference?: string
}
export interface Lesson extends z.infer<typeof lessonSchema> {
  id: string
  done?: boolean
}
export interface ScheduledSession extends z.infer<typeof scheduleSchema> {
  id: string
  programmeId: string
  programmeTitle?: string
}
export interface Notification {
  id: string
  message: string
  readAt: string | null
  createdAt: string
}
export interface Team {
  id: string
  name: string
  leaderId: string
  joinCode?: string
  members: { userId: string; name: string }[]
}
export interface Project extends z.infer<typeof projectSchema> {
  id: string
  userId: string
  teamId: string | null
  scores?: Score[]
  winner: boolean
}
export interface Score {
  judgeId: string
  values: number[]
  feedback: string
}
export interface StaffAssignment {
  userId: string
  name: string
  role: (typeof staffRoles)[number]
}
