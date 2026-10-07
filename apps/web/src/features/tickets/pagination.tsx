"use client";

import { PAGE_SIZES } from "@oneix/contracts";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const numberFormat = new Intl.NumberFormat("en");

/** "Showing 26–50 of 3,584" with page size, previous/next, and page numbers. */
export function Pagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600">
      <span>
        Showing <span className="font-medium text-zinc-900 tabular-nums">{numberFormat.format(from)}</span>–
        <span className="font-medium text-zinc-900 tabular-nums">{numberFormat.format(to)}</span> of{" "}
        <span className="font-medium text-zinc-900 tabular-nums">{numberFormat.format(total)}</span>
      </span>

      <label className="flex items-center gap-2">
        <span>Per page</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-1">
        <PageButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹ Prev
        </PageButton>
        {pageNumbers(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-zinc-400">
              …
            </span>
          ) : (
            <PageButton
              key={item}
              label={`Page ${item}`}
              current={item === page}
              onClick={() => onPageChange(item)}
            >
              {item}
            </PageButton>
          ),
        )}
        <PageButton label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next ›
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  children,
  label,
  current = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled || current}
      onClick={onClick}
      className={`min-w-8 rounded-md px-2.5 py-1 tabular-nums ${
        current
          ? "bg-zinc-900 font-medium text-white"
          : "border border-zinc-300 bg-white hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
      }`}
    >
      {children}
    </button>
  );
}

/** First, last, and two pages either side of the current one, with gaps between: 1 … 4 5 [6] 7 8 … 144 */
export function pageNumbers(page: number, totalPages: number): (number | "gap")[] {
  const pages = new Set([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const p of sorted) {
    const prev = result.at(-1);
    if (typeof prev === "number" && p - prev > 1) result.push(p - prev === 2 ? p - 1 : "gap");
    result.push(p);
  }
  return result;
}
