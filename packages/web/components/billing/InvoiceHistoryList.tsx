import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { IInvoice } from '@/lib/api/billing';

export interface InvoiceHistoryListProps {
  readonly invoices: readonly IInvoice[];
}

export function InvoiceHistoryList({ invoices }: InvoiceHistoryListProps) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="no-invoices">
        No invoices yet
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="invoice-list">
      {invoices.map((invoice) => {
        const downloadUrl = invoice.pdfUrl ?? invoice.hostedUrl;
        return (
          <div
            key={invoice.id}
            className="flex items-center justify-between rounded-md border p-3"
            data-testid="invoice-item"
          >
            <div>
              <p className="text-sm font-medium">
                ${invoice.amount.toFixed(2)} {invoice.currency.toUpperCase()}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {new Date(invoice.date).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  invoice.status === 'succeeded' || invoice.status === 'paid' ? 'default' : 'outline'
                }
              >
                {invoice.status}
              </Badge>
              {downloadUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`button-download-invoice-${invoice.id}`}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Download invoice
                  </a>
                </Button>
              ) : (
                <span
                  className="text-xs text-muted-foreground"
                  data-testid={`invoice-download-unavailable-${invoice.id}`}
                >
                  Receipt not available yet
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
