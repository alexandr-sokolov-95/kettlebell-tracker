export function message(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Something went wrong. Try again.';
}

export function Bell() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M10 12 8.5 7.5C8 5.8 9.3 4 11.3 4h9.4c2 0 3.3 1.8 2.8 3.5L22 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    <circle cx="16" cy="20" r="9.5" fill="currentColor"/>
    <path d="M12.4 21a3.8 3.8 0 0 1 2.2-4" stroke="#111812" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>;
}
