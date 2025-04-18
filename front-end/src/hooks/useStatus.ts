import { useEffect, useState } from 'react';

export function useStatus(taskUuid: string | null) {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    if (!taskUuid) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/status?uuid=${taskUuid}`);
        const data = await res.json();
        setStatus(res.ok ? data : null);
      } catch {
        setStatus(null);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [taskUuid]);

  return status;
}
