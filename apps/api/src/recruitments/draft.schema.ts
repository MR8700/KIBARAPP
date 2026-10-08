import { z } from 'zod';

export const FIELD_TYPES = ['text', 'longtext', 'number', 'single', 'multi', 'date', 'time', 'datetime', 'year', 'yesno', 'rating', 'phone', 'email', 'file', 'image', 'location'] as const;

const field = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1).max(200),
  required: z.boolean().default(false),
  config: z.object({
    allowedTypes: z.array(z.string()).optional(), maxSizeMb: z.number().max(50).optional(),
    multiple: z.boolean().optional(), maxCount: z.number().max(10).optional(),
  }).default({}),
  options: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  conditions: z.array(z.object({ dependsOnKey: z.string(), operator: z.enum(['eq', 'neq', 'in']), value: z.any() })).default([]),
});
export const draftSchema = z.object({
  sections: z.array(z.object({ id: z.string(), title: z.string().max(120), fields: z.array(field).max(80) })).max(20),
});
export type Draft = z.infer<typeof draftSchema>;
