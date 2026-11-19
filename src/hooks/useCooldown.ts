import { useEffect, useState } from 'react';

/** Countdown used to rate-limit "Resend code" buttons. */
export function useCooldown(initialSeconds = 0) {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);
  return { remaining, start: (s = 60) => setRemaining(s) };
}
