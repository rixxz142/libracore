import { useState } from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}
