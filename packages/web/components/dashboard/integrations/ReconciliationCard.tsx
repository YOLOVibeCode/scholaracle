'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { integrationsApi, type IPendingReconciliation } from '@/lib/api/integrations';
import { studentsApi, type IStudent } from '@/lib/api/students';
import { useAsyncData } from '@/lib/hooks';
import { UserPlus, Link2 } from 'lucide-react';

export function ReconciliationCard() {
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [linkingFor, setLinkingFor] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: pending, retry: refreshPending } = useAsyncData(
    () => integrationsApi.listReconciliationPending(),
    { retryCount: 1 }
  );
  const { data: students } = useAsyncData(() => studentsApi.getAll(), { retryCount: 1 });

  const handleLink = async (pendingId: string) => {
    if (!selectedStudentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await integrationsApi.linkReconciliation(pendingId, selectedStudentId);
      if (ok) {
        setLinkingFor(null);
        setSelectedStudentId('');
        refreshPending();
      } else {
        setError('Failed to link');
      }
    } catch {
      setError('Failed to link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (pendingId: string) => {
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await integrationsApi.createStudentFromReconciliation(pendingId, newName.trim());
      if (result) {
        setCreatingFor(null);
        setNewName('');
        refreshPending();
      } else {
        setError('Failed to create student');
      }
    } catch {
      setError('Failed to create student');
    } finally {
      setSubmitting(false);
    }
  };

  if (!pending?.length) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/20" data-testid="reconciliation-card">
      <CardHeader className="pb-2">
        <div>
          <h3 className="font-semibold text-lg leading-tight">Students from your sync</h3>
          <p className="text-sm text-muted-foreground mt-1">
            We found these students in your school data. Link them to existing students or create new profiles.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="space-y-3">
          {(pending as IPendingReconciliation[]).map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3 bg-background"
            >
              <span className="font-medium">{p.displayName || p.studentExternalId}</span>
              <span className="text-xs text-muted-foreground">({p.studentExternalId})</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {linkingFor === p.id ? (
                  <>
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Choose student" />
                      </SelectTrigger>
                      <SelectContent>
                        {(students ?? []).map((s: IStudent) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={submitting || !selectedStudentId}
                      onClick={() => handleLink(p.id)}
                    >
                      {submitting ? 'Linking...' : 'Link'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setLinkingFor(null); setSelectedStudentId(''); }}>
                      Cancel
                    </Button>
                  </>
                ) : creatingFor === p.id ? (
                  <>
                    <Label htmlFor={`recon-name-${p.id}`} className="sr-only">Name</Label>
                    <Input
                      id={`recon-name-${p.id}`}
                      placeholder="Student name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-[160px]"
                    />
                    <Button
                      size="sm"
                      disabled={submitting || !newName.trim()}
                      onClick={() => handleCreate(p.id)}
                    >
                      {submitting ? 'Creating...' : 'Create'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setCreatingFor(null); setNewName(''); }}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => { setLinkingFor(p.id); setCreatingFor(null); }}
                      data-testid={`recon-link-${p.id}`}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Link to existing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => { setCreatingFor(p.id); setLinkingFor(null); }}
                      data-testid={`recon-create-${p.id}`}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Create new
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
