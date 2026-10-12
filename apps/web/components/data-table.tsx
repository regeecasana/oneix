"use client"

import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown, ListFilter, X } from "lucide-react"
import type { ReactNode, Ref } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const MIN_FLEXIBLE_COLUMN_WIDTH = 240

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  getRowId: (row: TData) => string
  /** Sorting is done by the server: the table only reports what the user picked. */
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  onRowClick?: (row: TData) => void
  isLoading?: boolean
  loadingRows?: number
  /** Shown under the header when there are no rows. */
  empty?: ReactNode
  /**
   * Fills its parent's height and scrolls the rows inside, keeping the header in view.
   * The parent is a flex column with a bounded height, such as a Card that fills the page.
   */
  fill?: boolean
  /** The scrolling element, for example to scroll back to the top on a new page. */
  scrollRef?: Ref<HTMLDivElement>
}

/**
 * shadcn data table on TanStack Table, for server-side data: sorting and pagination are
 * reported to the caller, which fetches the matching rows.
 * Clicking a sortable header cycles ascending, descending, then back to the default order.
 * Columns have fixed widths (`meta.width`); text that doesn't fit ends in an ellipsis.
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  sorting,
  onSortingChange,
  onRowClick,
  isLoading = false,
  loadingRows = 8,
  empty,
  fill = false,
  scrollRef,
}: DataTableProps<TData>) {
  // The TanStack table instance is not memoizable by the React Compiler; that is expected here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: true,
    sortDescFirst: false,
    state: { sorting },
    onSortingChange,
  })

  // The column without a width (for example the subject) keeps at least this much room;
  // on narrower screens the table scrolls sideways instead of squeezing it to nothing.
  const fixedWidth = columns.reduce((sum, column) => sum + (column.meta?.width ?? 0), 0)
  const flexibleColumns = columns.filter((column) => column.meta?.width === undefined).length
  const minWidth = fixedWidth + flexibleColumns * MIN_FLEXIBLE_COLUMN_WIDTH

  return (
    <Table
      className="table-fixed"
      style={{ minWidth }}
      containerRef={scrollRef}
      containerClassName={cn(fill && "min-h-0 flex-1 overflow-auto")}
    >
      <TableHeader className={cn(fill && "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]")}>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted()
              return (
                <TableHead
                  key={header.id}
                  className={cn("overflow-hidden", header.column.columnDef.meta?.className)}
                  style={{ width: header.column.columnDef.meta?.width }}
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: loadingRows }, (_, i) => (
            <TableRow key={`loading-${i}`}>
              <TableCell colSpan={columns.length} className="px-4">
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))}
        {!isLoading &&
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(onRowClick && "cursor-pointer")}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={cn("truncate", cell.column.columnDef.meta?.className)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        {!isLoading && data.length === 0 && empty && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length}>{empty}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

/** A header that sorts its column: ascending, descending, then off. */
export function SortableHeader<TData>({
  column,
  title,
  align = "left",
}: {
  column: Column<TData>
  title: string
  align?: "left" | "right"
}) {
  const sorted = column.getIsSorted()
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown
  const next = sorted === false ? "ascending" : sorted === "asc" ? "descending" : "default order"
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-mx-2 h-8 gap-1.5 font-medium", align === "right" && "ml-auto flex", sorted && "text-foreground")}
      onClick={column.getToggleSortingHandler()}
      aria-label={`${title}: sort ${next}`}
    >
      {title}
      <Icon data-icon="inline-end" className={cn(!sorted && "text-muted-foreground/60")} />
    </Button>
  )
}

export interface FilterOption {
  value: string
  label: string
}

/**
 * A header that filters its column by value: tick one or more options, or clear to show all.
 * Used instead of sorting where agents pick values, such as status or priority.
 */
export function FilterHeader({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const active = selected.length > 0
  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("-mx-2 h-8 gap-1.5 font-medium", active && "text-foreground")}
          aria-label={active ? `${title}: filtered by ${selected.length}` : `Filter by ${title.toLowerCase()}`}
        >
          {title}
          {active ? (
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular-nums">
              {selected.length}
            </Badge>
          ) : (
            <ListFilter data-icon="inline-end" className="text-muted-foreground/60" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Show {title.toLowerCase()}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked === true)}
            // Keeps the menu open so several values can be ticked in a row.
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>
              <X />
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
