'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type { ColumnDef, ColumnFiltersState, SortingState, VisibilityState };

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: readonly TData[];
  /** Enable pagination UI and logic (default: false). Use manualPagination for server-side. */
  pagination?: boolean;
  /** Page size when pagination is enabled (default: 10). */
  pageSize?: number;
  /** Total page count for server-side pagination; required when manualPagination is true. */
  pageCount?: number;
  /** Server-side: you control pagination; no getPaginationRowModel. */
  manualPagination?: boolean;
  /** Enable sorting (default: false). Use manualSorting for server-side. */
  sorting?: boolean;
  /** Server-side: you control sorting; no getSortedRowModel. */
  manualSorting?: boolean;
  /** Enable filtering (default: false). Use manualFiltering for server-side. */
  filtering?: boolean;
  /** Server-side: you control filtering; no getFilteredRowModel. */
  manualFiltering?: boolean;
  /** Enable column visibility state (default: false). */
  columnVisibility?: boolean;
  /** Initial or controlled state. */
  initialState?: {
    sorting?: SortingState;
    columnFilters?: ColumnFiltersState;
    columnVisibility?: VisibilityState;
    pagination?: { pageIndex?: number; pageSize?: number };
  };
  /** Controlled pagination state (for server-side). */
  state?: {
    pagination?: { pageIndex: number; pageSize: number };
    sorting?: SortingState;
    columnFilters?: ColumnFiltersState;
    columnVisibility?: VisibilityState;
  };
  /** Called when pagination changes (for server-side). */
  onPaginationChange?: (updater: (prev: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number }) => void;
  /** Called when sorting changes (for server-side). */
  onSortingChange?: (updater: (prev: SortingState) => SortingState) => void;
  /** Called when column filters change (for server-side). */
  onColumnFiltersChange?: (updater: (prev: ColumnFiltersState) => ColumnFiltersState) => void;
  /** Optional props to spread on each table row (e.g. data-testid). */
  getRowProps?: (row: { id: string; original: TData }) => Record<string, unknown>;
}

/**
 * Reusable data grid built on TanStack Table and existing Table UI.
 * Use for admin and dashboard tables; add toolbar (search, column toggle, pagination) in the page.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  pagination = false,
  pageSize = 10,
  pageCount: pageCountProp,
  manualPagination = false,
  sorting = false,
  manualSorting = false,
  filtering = false,
  manualFiltering = false,
  columnVisibility: enableColumnVisibility = false,
  initialState,
  state: controlledState,
  onPaginationChange,
  onSortingChange,
  onColumnFiltersChange,
  getRowProps,
}: DataTableProps<TData, TValue>) {
  const [internalPagination, setInternalPagination] = React.useState({
    pageIndex: initialState?.pagination?.pageIndex ?? 0,
    pageSize: initialState?.pagination?.pageSize ?? pageSize,
  });
  const [sortingState, setSortingState] = React.useState<SortingState>(
    initialState?.sorting ?? controlledState?.sorting ?? []
  );
  const [columnFiltersState, setColumnFiltersState] =
    React.useState<ColumnFiltersState>(
      initialState?.columnFilters ?? controlledState?.columnFilters ?? []
    );
  const [columnVisibilityState, setColumnVisibilityState] =
    React.useState<VisibilityState>(initialState?.columnVisibility ?? {});

  const paginationState = controlledState?.pagination ?? internalPagination;
  const effectiveSorting = controlledState?.sorting ?? sortingState;
  const effectiveColumnFilters = controlledState?.columnFilters ?? columnFiltersState;
  const effectiveColumnVisibility = controlledState?.columnVisibility ?? columnVisibilityState;
  const setPagination = React.useCallback(
    (updaterOrValue: { pageIndex: number; pageSize: number } | ((prev: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number })) => {
      if (onPaginationChange) onPaginationChange(updaterOrValue as Parameters<NonNullable<typeof onPaginationChange>>[0]);
      else setInternalPagination((prev) => (typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue));
    },
    [onPaginationChange]
  );
  const setSorting = React.useCallback(
    (updaterOrValue: SortingState | ((prev: SortingState) => SortingState)) => {
      if (onSortingChange) onSortingChange(updaterOrValue as Parameters<NonNullable<typeof onSortingChange>>[0]);
      else setSortingState((prev) => (typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue));
    },
    [onSortingChange]
  );
  const setColumnFilters = React.useCallback(
    (updaterOrValue: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
      if (onColumnFiltersChange) onColumnFiltersChange(updaterOrValue as Parameters<NonNullable<typeof onColumnFiltersChange>>[0]);
      else setColumnFiltersState((prev) => (typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue));
    },
    [onColumnFiltersChange]
  );

  // TanStack Table returns unstable refs; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable() API limitation
  const table = useReactTable({
    data: data as TData[],
    columns,
    pageCount: manualPagination ? (pageCountProp ?? -1) : undefined,
    state: {
      ...((pagination || manualPagination) && { pagination: paginationState }),
      ...(sorting && { sorting: effectiveSorting }),
      ...(filtering && { columnFilters: effectiveColumnFilters }),
      ...(enableColumnVisibility && { columnVisibility: effectiveColumnVisibility }),
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibilityState,
    getCoreRowModel: getCoreRowModel(),
    ...(pagination && !manualPagination && { getPaginationRowModel: getPaginationRowModel() }),
    ...(sorting && !manualSorting && { getSortedRowModel: getSortedRowModel() }),
    ...(filtering && !manualFiltering && { getFilteredRowModel: getFilteredRowModel() }),
    manualPagination: !!manualPagination,
    manualSorting: !!manualSorting,
    manualFiltering: !!manualFiltering,
    initialState: {
      pagination: { pageSize, pageIndex: 0 },
      ...initialState,
    },
  });

  return (
    <div className="w-full space-y-4">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  {...(getRowProps?.(row) ?? {})}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {(pagination || manualPagination) && table.getPageCount() !== 0 && (
        <div className="flex items-center justify-end gap-2">
          <p className="text-muted-foreground text-sm">
            {table.getPageCount() > 0
              ? `Page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}`
              : `Page ${table.getState().pagination.pageIndex + 1}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              data-testid="previous-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              data-testid="next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

