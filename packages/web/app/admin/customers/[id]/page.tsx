'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminCustomersApi, type IAdminCustomerActivityItem, type ICustomerDetail } from '@/lib/api/admin/customers';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import {
  CustomerActivityTimeline,
  CustomerOverviewTab,
  CustomerNotesTab,
  CustomerSubscriptionTab,
  CustomerPaymentsTab,
  CustomerStudentsTab,
  CustomerSuspendPanel,
  CustomerPasswordPanel,
} from '@/components/admin';

type TabType = 'overview' | 'subscription' | 'payments' | 'students' | 'notes';

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const [isSuspendPanelOpen, setIsSuspendPanelOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);
  const [isUnsuspending, setIsUnsuspending] = useState(false);
  const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(false);
  const [setPasswordValue, setSetPasswordValue] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isForcingReset, setIsForcingReset] = useState(false);

  const { data: customer, isLoading, error, retry } = useAsyncData<ICustomerDetail>(
    async () => {
      const response = await adminCustomersApi.getById(id);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load customer');
      }
      return response.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const {
    data: activityData,
    isLoading: activityLoading,
    error: activityError,
    retry: retryActivity,
  } = useAsyncData<readonly IAdminCustomerActivityItem[]>(
    async () => {
      if (!id) return [];
      const res = await adminCustomersApi.getActivity(id, 50);
      if (!res.success) throw new Error(res.error ?? 'Failed to load activity');
      return res.data ?? [];
    },
    { retryCount: 1, retryDelay: 500 }
  );
  const activityItems = activityData ?? [];

  const handleSuspend = async () => {
    if (!customer) return;
    setToast(null);
    setSuspendReason('');
    setIsSuspendPanelOpen(true);
  };

  const confirmSuspend = async () => {
    if (!customer) return;
    if (!suspendReason.trim()) {
      setToast('Please provide a suspension reason.');
      return;
    }

    setIsSuspending(true);
    setToast(null);
    try {
      const result = await adminCustomersApi.suspend(id, suspendReason.trim());
      if (result.success) {
        setToast('Customer suspended');
        setIsSuspendPanelOpen(false);
        retry(); // Refresh customer data
      } else {
        setToast('Failed to suspend customer');
      }
    } finally {
      setIsSuspending(false);
    }
  };

  const cancelSuspend = () => {
    setIsSuspendPanelOpen(false);
    setSuspendReason('');
  };

  const handleUnsuspend = async () => {
    if (!customer) return;
    setIsUnsuspending(true);
    setToast(null);
    try {
      const result = await adminCustomersApi.unsuspend(id);
      if (result.success) {
        setToast('Customer unsuspended');
        retry(); // Refresh customer data
      } else {
        setToast('Failed to unsuspend customer');
      }
    } finally {
      setIsUnsuspending(false);
    }
  };

  const handleImpersonate = () => {
    router.push(`/admin/impersonate/${id}`);
  };

  const handleSetPasswordSubmit = async () => {
    if (setPasswordValue.length < 8 || setPasswordValue !== setPasswordConfirm) return;
    setIsSettingPassword(true);
    setToast(null);
    try {
      const result = await adminCustomersApi.setPassword(id, setPasswordValue);
      if (result.success) {
        setToast('Password updated');
        setIsSetPasswordOpen(false);
        setSetPasswordValue('');
        setSetPasswordConfirm('');
      } else {
        setToast(result.error ?? 'Failed to set password');
      }
    } finally {
      setIsSettingPassword(false);
    }
  };

  const handleSendReset = async () => {
    setIsSendingReset(true);
    setToast(null);
    try {
      const result = await adminCustomersApi.sendReset(id);
      if (result.success) {
        setToast('Reset link sent to customer email');
      } else {
        setToast(result.error ?? 'Failed to send reset link');
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleForceReset = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Require this customer to change their password on next login?')) return;
    setIsForcingReset(true);
    setToast(null);
    try {
      const result = await adminCustomersApi.forceReset(id);
      if (result.success) {
        setToast('Customer will be required to reset password on next login');
      } else {
        setToast(result.error ?? 'Failed to set force reset');
      }
    } finally {
      setIsForcingReset(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/customers" data-testid="back-link" className="text-sm underline">
          Back
        </Link>
      </div>

      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
          {toast}
        </div>
      )}

      {isLoading && <LoadingSkeleton variant="card" />}
      {error && <ErrorDisplay error={error} title="Failed to load customer" onRetry={retry} />}

      {customer && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight" data-testid="customer-detail-title">
                {customer.name}
              </h1>
              <p className="text-gray-600 dark:text-gray-400" data-testid="customer-detail-email">
                {customer.email}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                onClick={handleImpersonate}
                data-testid="button-impersonate"
              >
                Login as user
              </button>
            </div>
          </div>

          <div role="tablist" aria-label="Customer Tabs" className="flex gap-2 border-b">
            <button
              role="tab"
              aria-selected={activeTab === 'overview'}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('overview')}
              data-testid="tab-overview"
            >
              Overview
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'subscription'}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'subscription'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('subscription')}
              data-testid="tab-subscription"
            >
              Subscription
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'payments'}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'payments'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('payments')}
              data-testid="tab-payments"
            >
              Payments
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'students'}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'students'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('students')}
              data-testid="tab-students"
            >
              Students
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'notes'}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'notes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('notes')}
              data-testid="tab-notes"
            >
              Notes
            </button>
          </div>

          <div data-testid="customer-tab-content">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <CustomerOverviewTab customer={customer} onSuspend={handleSuspend} onUnsuspend={handleUnsuspend} />
                <CustomerPasswordPanel
                  isSetPasswordOpen={isSetPasswordOpen}
                  password={setPasswordValue}
                  passwordConfirm={setPasswordConfirm}
                  isSubmitting={isSettingPassword}
                  onOpenSetPassword={() => setIsSetPasswordOpen(true)}
                  onCloseSetPassword={() => {
                    setIsSetPasswordOpen(false);
                    setSetPasswordValue('');
                    setSetPasswordConfirm('');
                  }}
                  onPasswordChange={setSetPasswordValue}
                  onPasswordConfirmChange={setSetPasswordConfirm}
                  onSetPasswordSubmit={handleSetPasswordSubmit}
                  onSendReset={handleSendReset}
                  onForceReset={handleForceReset}
                  isSendingReset={isSendingReset}
                  isForcingReset={isForcingReset}
                />
                <CustomerSuspendPanel
                  isOpen={isSuspendPanelOpen}
                  reason={suspendReason}
                  isSubmitting={isSuspending || isUnsuspending}
                  onReasonChange={setSuspendReason}
                  onConfirm={confirmSuspend}
                  onCancel={cancelSuspend}
                />
                {activityLoading ? (
                  <LoadingSkeleton variant="list" count={4} />
                ) : activityError ? (
                  <ErrorDisplay error={activityError} title="Failed to load activity" onRetry={retryActivity} />
                ) : (
                  <CustomerActivityTimeline items={activityItems} />
                )}
              </div>
            )}
            {activeTab === 'subscription' && (
              <CustomerSubscriptionTab customerId={id} subscriptionId={customer.subscription?.id} />
            )}
            {activeTab === 'payments' && <CustomerPaymentsTab customerId={id} />}
            {activeTab === 'students' && <CustomerStudentsTab customerId={id} />}
            {activeTab === 'notes' && <CustomerNotesTab customerId={id} />}
          </div>
        </>
      )}
    </div>
  );
}


