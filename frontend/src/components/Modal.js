import { useEffect, useRef } from 'react';
import Icon from './Icon';

// Accessible dialog: traps focus, closes on Escape, restores focus on close.
export default function Modal({ title, onClose, children, footer, size = 'md' }) {
  const dialogRef = useRef(null);
  // Keep the latest onClose without re-running the focus effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = dialog.querySelector('[data-autofocus]')
      || dialog.querySelector('.modal-body input, .modal-body select, .modal-body textarea')
      || focusable()[0];
    if (first) first.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const items = focusable();
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    }
    dialog.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open');
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}>
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
