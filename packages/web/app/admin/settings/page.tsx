'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { adminUsersApi, type AdminRole, type IAdminUser } from '@/lib/api/admin/users';
import { AdminStepUpSheet } from '@/components/admin';

export default function AdminSettingsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState<AdminRole>('admin');
  const [createPassword, setCreatePassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>('support');

  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'create'; payload: { email: string; name: string; role: AdminRole; password: string } }
    | { kind: 'update'; id: string; payload: { role: AdminRole } }
    | null
  >(null);

  const { data: adminsData, isLoading, error, retry, refresh } = useAsyncData<readonly IAdminUser[]>(
    async () => {
      const res = await adminUsersApi.list();
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load admin users');
      return res.data;
    },
    { retryCount: 1, retryDelay: 500 }
  );

  const admins = adminsData ?? [];
  const hasLoadedOnce = adminsData !== null;
  const showFullLoading = isLoading && !hasLoadedOnce;

  const openCreate = () => {
    setToast(null);
    setCreateEmail('');
    setCreateName('');
    setCreateRole('admin');
    setCreatePassword('');
    setIsCreateOpen(true);
  };

  const closeCreate = () => setIsCreateOpen(false);

  const submitCreate = async () => {
    setToast(null);
    if (!createEmail.trim() || !createName.trim() || !createPassword.trim()) {
      setToast('Email, name, and password are required.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        email: createEmail.trim(),
        name: createName.trim(),
        role: createRole,
        password: createPassword,
      };
      const res = await adminUsersApi.create(payload);
      if (!res.success) {
        if (res.code === 'MFA_STEP_UP_REQUIRED') {
          setPendingAction({ kind: 'create', payload });
          setIsStepUpOpen(true);
          setToast('MFA re-verification required to create an admin.');
          return;
        }
        setToast(res.error ?? 'Failed to create admin user');
        return;
      }
      setToast('Admin user created successfully.');
      closeCreate();
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (id: string, currentRole: AdminRole) => {
    setToast(null);
    setEditingId(id);
    setEditRole(currentRole);
  };

  const cancelEdit = () => setEditingId(null);

  const submitEdit = async () => {
    if (!editingId) return;
    setToast(null);
    setIsSaving(true);
    try {
      const res = await adminUsersApi.update(editingId, { role: editRole });
      if (!res.success) {
        if (res.code === 'MFA_STEP_UP_REQUIRED') {
          setPendingAction({ kind: 'update', id: editingId, payload: { role: editRole } });
          setIsStepUpOpen(true);
          setToast('MFA re-verification required to update an admin.');
          return;
        }
        setToast(res.error ?? 'Failed to update admin user');
        return;
      }
      setToast('Admin user updated');
      setEditingId(null);
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleStepUpVerified = async (stepUpToken: string) => {
    if (!pendingAction) return;
    setToast(null);
    setIsSaving(true);
    try {
      if (pendingAction.kind === 'create') {
        const res = await adminUsersApi.create(pendingAction.payload, stepUpToken);
        if (!res.success) {
          setToast(res.error ?? 'Failed to create admin user');
          return;
        }
        setToast('Admin user created successfully.');
        closeCreate();
        refresh();
        setPendingAction(null);
        return;
      }

      const res = await adminUsersApi.update(pendingAction.id, pendingAction.payload, stepUpToken);
      if (!res.success) {
        setToast(res.error ?? 'Failed to update admin user');
        return;
      }
      setToast('Admin user updated');
      setEditingId(null);
      refresh();
      setPendingAction(null);
    } finally {
      setIsSaving(false);
    }
  };

  const roleOptions = useMemo(
    () => ['super_admin', 'admin', 'support', 'billing', 'analyst'] as const,
    []
  );

  return (
    <div className="space-y-4" data-testid="admin-settings-page">
      <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
      <p className="text-gray-600 dark:text-gray-400">System configuration</p>

      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
          {toast}
        </div>
      )}

      <Card data-testid="admin-users-section">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Admin Users</CardTitle>
            <CardDescription>Create and manage admin accounts (super_admin only).</CardDescription>
          </div>
          <Button onClick={openCreate} data-testid="button-add-admin">
            Add Admin
          </Button>
        </CardHeader>
        <CardContent>
          {showFullLoading && <LoadingSkeleton variant="list" count={6} />}
          {error && !showFullLoading && <ErrorDisplay error={error} title="Failed to load admin users" onRetry={retry} />}

          {!showFullLoading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.id} data-testid="admin-user-row">
                    <TableCell className="text-sm">{a.email}</TableCell>
                    <TableCell className="text-sm">{a.name}</TableCell>
                    <TableCell className="text-sm">{a.role}</TableCell>
                    <TableCell className="text-sm">{a.isActive ? 'active' : 'inactive'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(a.id, a.role)}
                        data-testid="button-edit-admin"
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {admins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-gray-600 dark:text-gray-400">
                      No admin users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && (
        <Card data-testid="admin-create-panel">
          <CardHeader>
            <CardTitle>Create Admin User</CardTitle>
            <CardDescription>Provide credentials and role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} data-testid="input-admin-email" placeholder="email" />
            <Input value={createName} onChange={(e) => setCreateName(e.target.value)} data-testid="input-admin-name" placeholder="name" />
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as AdminRole)}
              data-testid="select-admin-role"
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Input
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              data-testid="input-admin-password"
              placeholder="temporary password"
              type="password"
            />
            <div className="flex gap-2">
              <Button onClick={submitCreate} disabled={isSaving} data-testid="button-admin-save">
                Save
              </Button>
              <Button variant="outline" onClick={closeCreate} disabled={isSaving} data-testid="button-admin-cancel">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingId && (
        <Card data-testid="admin-edit-panel">
          <CardHeader>
            <CardTitle>Edit Admin User</CardTitle>
            <CardDescription>Update role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as AdminRole)}
              data-testid="select-edit-admin-role"
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button onClick={submitEdit} disabled={isSaving} data-testid="button-admin-update">
                Update
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={isSaving} data-testid="button-admin-cancel-edit">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AdminStepUpSheet
        open={isStepUpOpen}
        onOpenChange={(open) => {
          setIsStepUpOpen(open);
          if (!open) setPendingAction(null);
        }}
        onVerified={handleStepUpVerified}
        title="Re-verify MFA to continue"
        description="This action requires step-up authentication."
      />
    </div>
  );
}


