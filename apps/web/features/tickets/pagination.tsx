"use client"

import { PAGE_SIZES } from "@oneix/contracts"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const numberFormat = new Intl.NumberFormat("en")

/** "Showing 26–50 of 3,584" with page size, previous/next, and page numbers. */
export function Pagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span>
        Showing <span className="font-medium text-foreground tabular-nums">{numberFormat.format(from)}</span>–
        <span className="font-medium text-foreground tabular-nums">{numberFormat.format(to)}</span> of{" "}
        <span className="font-medium text-foreground tabular-nums">{numberFormat.format(total)}</span>
      </span>

      <div className="flex items-center gap-2">
        <span>Per page</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger size="sm" className="w-20" aria-label="Tickets per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft data-icon="inline-start" />
          Prev
        </Button>
        {pageNumbers(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} className="px-1">
              …
            </span>
          ) : (
            <Button
              key={item}
              size="sm"
              variant={item === page ? "default" : "ghost"}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Page ${item}`}
              className="min-w-8 tabular-nums"
              onClick={() => item !== page && onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}

/** First, last, and two pages either side of the current one, with gaps between: 1 … 4 5 [6] 7 8 … 144 */
export function pageNumbers(page: number, totalPages: number): (number | "gap")[] {
  const pages = new Set([1, totalPages])
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p)

  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | "gap")[] = []
  for (const p of sorted) {
    const prev = result.at(-1)
    if (typeof prev === "number" && p - prev > 1) result.push(p - prev === 2 ? p - 1 : "gap")
    result.push(p)
  }
  return result
}
