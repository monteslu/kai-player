/**
 * Toast - Reusable toast notification component
 *
 * Features:
 * - Success/error/info/warning variants
 * - Auto-dismiss after configurable duration
 * - Material Icons
 * - Slide-in animation
 */

import { useEffect } from 'react';
import './Toast.css';

export function Toast({ message, type = 'success', onClose, duration = 3000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
    warning: 'warning'
  };

  return (
    <div className={`toast toast-${type}`}>
      <span className="material-icons">{icons[type]}</span>
      <span className="toast-message">{message}</span>
    </div>
  );
}
