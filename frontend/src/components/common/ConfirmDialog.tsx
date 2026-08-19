"use client";

import { PiqBtn, PiqModal } from "@/components/piq/primitives";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain terms — not "Are you sure?". */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation step for irreversible actions. Built on PiqModal so it inherits
 * Escape-to-close, backdrop-click-to-close, and the shared modal styling
 * instead of re-implementing them.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <PiqModal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      width={420}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <PiqBtn variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </PiqBtn>
          <PiqBtn
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </PiqBtn>
        </div>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--text2)", lineHeight: 1.6 }}>{message}</p>
    </PiqModal>
  );
}
