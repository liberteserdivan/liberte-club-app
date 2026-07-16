export default function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type === 'error' ? 'err' : ''}`}>{toast.message}</div>;
}
