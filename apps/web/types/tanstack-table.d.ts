import "@tanstack/react-table"

declare module "@tanstack/react-table" {
  // Column metadata used by the shared DataTable: classes for the header and body cells.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string
    /** Fixed column width in px. A column without one takes the remaining space. */
    width?: number
  }
}
