import { z } from "zod";

export const PAGE_SIZES = [25, 50, 100] as const;

/** One page of a list. `page` is 1-based. */
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });

export const ApiError = z.object({
  statusCode: z.number(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
