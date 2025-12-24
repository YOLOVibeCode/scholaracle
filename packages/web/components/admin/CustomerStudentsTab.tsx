/**
 * CustomerStudentsTab (ISP)
 *
 * Focused component: render students for a customer.
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { adminCustomersApi, type IAdminCustomerStudent } from '@/lib/api/admin/customers';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';

export interface ICustomerStudentsTabProps {
  readonly customerId: string;
}

export function CustomerStudentsTab({ customerId }: ICustomerStudentsTabProps) {
  const { data, isLoading, error, retry } = useAsyncData<readonly IAdminCustomerStudent[]>(
    async () => {
      const res = await adminCustomersApi.getStudents(customerId);
      if (!res.success) {
        throw new Error(res.error ?? 'Failed to load students');
      }
      return res.data ?? [];
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const students = data ?? [];

  return (
    <div className="space-y-4" data-testid="customer-students-tab">
      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
          <CardDescription>Students under this customer account</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <LoadingSkeleton variant="list" count={3} />}
          {error && !isLoading && <ErrorDisplay error={error} title="Failed to load students" onRetry={retry} />}

          {!isLoading && !error && (
            <>
              {students.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="customer-students-empty">
                  No students found for this customer.
                </p>
              ) : (
                <div className="space-y-2" data-testid="customer-students-list">
                  {students.map((s) => (
                    <div key={s.id} className="rounded-md border p-3" data-testid="customer-student-row">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{s.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                            {typeof s.grade === 'number' && (
                              <Badge variant="outline" data-testid="student-grade">
                                Grade {s.grade}
                              </Badge>
                            )}
                            {s.studentId && (
                              <span data-testid="student-external-id">ID: {s.studentId}</span>
                            )}
                          </div>
                        </div>

                        {s.stats && (
                          <div className="shrink-0 text-right text-xs text-gray-600 dark:text-gray-400">
                            {typeof s.stats.currentGPA === 'number' && (
                              <div data-testid="student-gpa">GPA: {s.stats.currentGPA.toFixed(2)}</div>
                            )}
                            {typeof s.stats.missingAssignments === 'number' && (
                              <div data-testid="student-missing">
                                Missing: {s.stats.missingAssignments}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


