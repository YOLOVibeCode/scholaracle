'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { studentsApi } from '@/lib/api/students';
import { integrationsApi, type IAssignStudentCredentials } from '@/lib/api/integrations';
import { useAsyncData } from '@/lib/hooks';

export interface AssignStudentSheetProps {
  open: boolean;
  integrationId: string;
  integrationDisplayName: string;
  linkedStudentIds: string[];
  onClose: () => void;
  onAssigned?: () => void;
}

export function AssignStudentSheet({
  open,
  integrationId,
  integrationDisplayName,
  linkedStudentIds,
  onClose,
  onAssigned,
}: AssignStudentSheetProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: students } = useAsyncData(() => studentsApi.getAll(), { retryCount: 1 });
  const availableStudents = (students ?? []).filter((s) => !linkedStudentIds.includes(s.id));

  const handleClose = () => {
    setSelectedStudentId('');
    setAccessToken('');
    setError(null);
    onClose();
  };

  const handleAssign = async () => {
    if (!selectedStudentId) {
      setError('Select a student');
      return;
    }
    setError(null);
    setSubmitting(true);

    let credentials: IAssignStudentCredentials | undefined;
    if (accessToken.trim()) {
      credentials = { authType: 'api', accessToken: accessToken.trim() };
    }

    try {
      const result = await integrationsApi.assignStudent(integrationId, selectedStudentId, {
        credentials,
      });
      if (result) {
        onAssigned?.();
        handleClose();
      } else {
        setError('Failed to assign student');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign student');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="sm:max-w-md" data-testid="assign-student-sheet">
        <SheetHeader>
          <SheetTitle>Assign student to {integrationDisplayName}</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose a student and optionally add their API access token for this provider.
          </p>

          <div className="space-y-2">
            <Label>Student</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger data-testid="assign-student-select">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {availableStudents.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableStudents.length === 0 && (
              <p className="text-xs text-muted-foreground">All students are already linked to this integration.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>API access token (optional — can add later)</Label>
            <Input
              type="password"
              placeholder="Access token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              data-testid="assign-credentials-token"
            />
            <p className="text-xs text-muted-foreground">
              For Canvas/Skyward/Aeries portal login, use the iOS app, browser extension, or{' '}
              <code>npx scholaracle-scraper run</code> on your computer.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAssign}
              disabled={submitting || !selectedStudentId}
              data-testid="assign-student-submit"
            >
              {submitting ? 'Assigning...' : 'Assign'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
