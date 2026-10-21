import { useId } from 'react';

// Labelled form control with an associated error message.
export default function Field({ label, error, hint, required, children, className = '' }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
  const control = typeof children === 'function'
    ? children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })
    : children;

  return (
    <div className={`field ${error ? 'field-error' : ''} ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required" aria-hidden="true"> *</span>}
      </label>
      {control}
      {hint && !error && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-message">{error}</p>}
    </div>
  );
}
