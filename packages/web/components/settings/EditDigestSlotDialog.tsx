'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IDigestSlotApi } from '@/lib/api/settings';

export interface EditDigestSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: IDigestSlotApi;
  onSave: (slot: IDigestSlotApi) => void;
  onRemove?: () => void;
  allowRemove?: boolean;
}

export function EditDigestSlotDialog({
  open,
  onOpenChange,
  slot,
  onSave,
  onRemove,
  allowRemove = false,
}: EditDigestSlotDialogProps) {
  const [time, setTime] = useState(slot.time);
  const [label, setLabel] = useState(slot.label);

  const handleSave = () => {
    onSave({ time, label, enabled: slot.enabled });
    onOpenChange(false);
  };

  const handleRemove = () => {
    onRemove?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="edit-digest-slot-dialog">
        <DialogHeader>
          <DialogTitle>Edit digest time</DialogTitle>
          <DialogDescription>Change the time and label for this digest slot.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-slot-time">Time</Label>
            <Input
              id="edit-slot-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              data-testid="edit-slot-time"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-slot-label">Label</Label>
            <Input
              id="edit-slot-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Morning, After School"
              data-testid="edit-slot-label"
            />
          </div>
        </div>
        <DialogFooter>
          {allowRemove && onRemove && (
            <Button type="button" variant="destructive" onClick={handleRemove} className="mr-auto">
              Remove slot
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} data-testid="edit-slot-save">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
