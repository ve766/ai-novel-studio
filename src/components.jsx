import React, { cloneElement, isValidElement, useEffect } from 'react';
import { X } from 'lucide-react';

const cx = (...values) => values.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'normal', className = '', children, icon: Icon, type = 'button', ...props }) {
  const buttonSize = size === 'sm' || size === 'small' ? 'small' : size === 'lg' || size === 'large' ? 'large' : 'normal';
  return <button type={type} className={cx('button', `button-${variant}`, `button-${buttonSize}`, className)} {...props}>
    {Icon && <Icon size={buttonSize === 'small' ? 14 : 16} strokeWidth={1.8} />}{children}
  </button>;
}

export function Input({ className = '', ...props }) {
  return <input className={cx('field-control', className)} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={cx('field-control', className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return <select className={cx('field-control', 'field-select', className)} {...props}>{children}</select>;
}

export function IconButton({ label, className = '', type = 'button', children, ...props }) {
  return <button type={type} aria-label={label} title={label} className={cx('icon-button', className)} {...props}>{children}</button>;
}

export function Modal({ open, title, eyebrow, children, footer, onClose, width = 'normal', size }) {
  const modalWidth = size ? ({ sm: 'compact', lg: 'wide', md: 'normal' }[size] || width) : width;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className={`modal modal-${modalWidth}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><IconButton label="关闭" onClick={onClose}><X size={18} /></IconButton></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}

export function ConfirmDialog({ open, title = '请确认', children, confirmText = '确认', destructive = false, busy = false, onClose, onConfirm }) {
  return <Modal open={open} title={title} eyebrow="确认操作" onClose={busy ? undefined : onClose} width="compact" footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>取消</Button><Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? '处理中…' : confirmText}</Button></>}>
    <div className="confirm-copy">{children}</div>
  </Modal>;
}

export function Field({ label, hint, className = '', as = 'input', children, ...props }) {
  const control = children || (as === 'select' ? <Select {...props} /> : as === 'textarea' ? <Textarea {...props} /> : <Input {...props} />);
  return <label className={cx('field', className)}>{label && <span className="field-label">{label}</span>}{control}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Toggle({ checked, onChange, label, hint, disabled = false }) {
  return <label className={`toggle-row ${disabled ? 'toggle-disabled' : ''}`}>
    <span className="toggle-copy"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    <input type="checkbox" checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} disabled={disabled} />
    <span className="toggle-track" aria-hidden="true"><span /></span>
  </label>;
}

export function Tabs({ items, value, onChange, className = '' }) {
  return <div className={cx('tabs', className)} role="tablist">
    {items.map(item => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} className={value === item.value ? 'tab-active' : ''} onClick={() => onChange(item.value)}>{item.label}</button>)}
  </div>;
}

export function EmptyState({ icon, title, description, action, className = '', eyebrow }) {
  const renderedIcon = isValidElement(icon) ? cloneElement(icon, { size: icon.props.size || 22, strokeWidth: icon.props.strokeWidth || 1.5 }) : icon ? React.createElement(icon, { size: 22, strokeWidth: 1.5 }) : null;
  return <div className={cx('empty-state', className)}>
    {renderedIcon && <span className="empty-icon">{renderedIcon}</span>}{eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h3>{title}</h3>{description && <p>{description}</p>}{action}
  </div>;
}

export function Pill({ children, tone = 'neutral', icon: Icon }) {
  return <span className={`pill pill-${tone}`}>{Icon && <Icon size={12} strokeWidth={2} />}{children}</span>;
}

export function SectionHeading({ kicker, title, description, action }) {
  return <div className="section-heading"><div className="section-heading-copy">{kicker && <span className="eyebrow">{kicker}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="section-heading-action">{action}</div>}</div>;
}

export function StatCard({ label, value, detail, icon }) {
  return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><span className="stat-icon">{isValidElement(icon) ? icon : icon ? React.createElement(icon, { size: 16 }) : null}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onClose, toast.tone === 'error' ? 6500 : 4200);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast toast-${toast.tone || 'success'}`} role="status" aria-live="polite"><span>{toast.text}</span><button onClick={onClose} aria-label="关闭提示">×</button></div>;
}
