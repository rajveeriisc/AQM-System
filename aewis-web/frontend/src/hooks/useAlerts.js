import { useEffect, useCallback } from 'react';
import client from '../api/client';
import useStore from '../store';

export function useAlerts() {
  const activeAlerts = useStore((s) => s.activeAlerts);
  const setActiveAlerts = useStore((s) => s.setActiveAlerts);
  const acknowledgeAlert = useStore((s) => s.acknowledgeAlert);

  const fetchActive = useCallback(async () => {
    try {
      const { data } = await client.get('/alerts/active');
      setActiveAlerts(data);
    } catch (err) {
      console.error('fetchActive alerts error:', err);
    }
  }, [setActiveAlerts]);

  const acknowledge = useCallback(async (alertId) => {
    try {
      await client.patch(`/alerts/${alertId}/ack`);
      acknowledgeAlert(alertId);
    } catch (err) {
      console.error('acknowledge error:', err);
    }
  }, [acknowledgeAlert]);

  const acknowledgeAll = useCallback(async () => {
    try {
      await client.post('/alerts/ack-all');
      setActiveAlerts([]);
    } catch (err) {
      console.error('acknowledgeAll error:', err);
    }
  }, [setActiveAlerts]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  return { activeAlerts, acknowledge, acknowledgeAll, refetch: fetchActive };
}
