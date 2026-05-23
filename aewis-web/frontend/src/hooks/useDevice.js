import { useEffect, useCallback, useRef } from 'react';
import client from '../api/client';
import useStore from '../store';

export function useDevice() {
  const setDevices = useStore((s) => s.setDevices);
  const devices = useStore((s) => s.devices);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const setLiveReading = useStore((s) => s.setLiveReading);
  const setReadingHistory = useStore((s) => s.setReadingHistory);
  const pollRef = useRef(null);

  const fetchDevices = useCallback(async () => {
    try {
      const { data } = await client.get('/devices');
      setDevices(data);
      // Prime liveReading from the embedded latestReading so gauges
      // show last known values immediately (before socket delivers a live update)
      const selected = data.find((d) => d.id === useStore.getState().selectedDeviceId);
      if (selected?.latestReading) {
        const cur = useStore.getState().liveReading;
        if (!cur) setLiveReading(selected.latestReading);
      }
    } catch (err) {
      console.error('fetchDevices error:', err);
    }
  }, [setDevices, setLiveReading]);

  const fetchLatestReading = useCallback(async (deviceId) => {
    if (!deviceId) return;
    try {
      const { data } = await client.get('/readings/latest', { params: { deviceId } });
      if (data) setLiveReading(data);
    } catch (err) {
      console.error('fetchLatestReading error:', err);
    }
  }, [setLiveReading]);

  const fetchHistory = useCallback(async (deviceId, hours = 1) => {
    if (!deviceId) return;
    try {
      const from = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const { data } = await client.get('/readings', { params: { deviceId, from, limit: 500 } });
      setReadingHistory(data.reverse());
    } catch (err) {
      console.error('fetchHistory error:', err);
    }
  }, [setReadingHistory]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (!selectedDeviceId) return;
    fetchLatestReading(selectedDeviceId);
    fetchHistory(selectedDeviceId, 1);

    // Fallback poll every 30 s — catches up when socket is down
    pollRef.current = setInterval(() => fetchLatestReading(selectedDeviceId), 30000);
    return () => clearInterval(pollRef.current);
  }, [selectedDeviceId]);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || null;

  return { devices, selectedDevice, fetchDevices, fetchHistory };
}
