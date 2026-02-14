const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminToken');
}

async function downloadCsv(
  path: string,
  filename: string,
  params?: { startDate?: string; endDate?: string }
): Promise<{ success: boolean; error?: string }> {
  const token = getAdminToken();
  if (!token) {
    return { success: false, error: 'Not authenticated as admin' };
  }

  const url = new URL(`${API_BASE}${path}`);
  if (params?.startDate) url.searchParams.set('startDate', params.startDate);
  if (params?.endDate) url.searchParams.set('endDate', params.endDate);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      let err = `Export failed (${res.status})`;
      try {
        const json = JSON.parse(text) as { error?: string };
        if (json.error) err = json.error;
      } catch {
        if (text) err = text.slice(0, 200);
      }
      return { success: false, error: err };
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    const match = disposition?.match(/filename="?([^";]+)"?/);
    const name = match?.[1] ?? filename;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Export failed',
    };
  }
}

/**
 * Admin reports API — CSV exports.
 */
export const adminReportsApi = {
  /**
   * Download customers CSV. Optional startDate/endDate as ISO strings.
   */
  async exportCustomers(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return downloadCsv('/admin/reports/export/customers', 'customers.csv', params);
  },

  /**
   * Download payments CSV. Optional startDate/endDate as ISO strings.
   */
  async exportPayments(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return downloadCsv('/admin/reports/export/payments', 'payments.csv', params);
  },

  /**
   * Download subscriptions CSV. Optional startDate/endDate as ISO strings.
   */
  async exportSubscriptions(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return downloadCsv('/admin/reports/export/subscriptions', 'subscriptions.csv', params);
  },
};
