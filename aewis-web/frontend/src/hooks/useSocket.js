import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useStore from '../store';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || '/', {
      withCredentials: true,
      autoConnect: false,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: { token: useStore.getState().token },
    });
  }
  return socket;
}

export function useSocket() {
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const setLiveReading = useStore((s) => s.setLiveReading);
  const appendReading = useStore((s) => s.appendReading);
  const addAlert = useStore((s) => s.addAlert);
  const resolveAlert = useStore((s) => s.resolveAlert);
  const updateDeviceStatus = useStore((s) => s.updateDeviceStatus);
  const prevDeviceRef = useRef(null);

  useEffect(() => {
    const sock = getSocket();

    if (!sock.connected) sock.connect();

    const onSensorUpdate = (reading) => {
      setLiveReading(reading);
      appendReading(reading);
    };
    const onAlertNew = (alert) => addAlert(alert);
    const onAlertResolved = ({ alertId }) => resolveAlert(alertId);
    const onDeviceStatus = ({ deviceId, status, lastSeen }) => updateDeviceStatus(deviceId, status, lastSeen);

    sock.on('sensor:update', onSensorUpdate);
    sock.on('alert:new', onAlertNew);
    sock.on('alert:resolved', onAlertResolved);
    sock.on('device:status', onDeviceStatus);

    return () => {
      sock.off('sensor:update', onSensorUpdate);
      sock.off('alert:new', onAlertNew);
      sock.off('alert:resolved', onAlertResolved);
      sock.off('device:status', onDeviceStatus);
    };
  }, []);

  // Subscribe/unsubscribe when device changes — re-subscribes on every reconnect
  useEffect(() => {
    const sock = getSocket();

    const doSubscribe = () => {
      if (prevDeviceRef.current && prevDeviceRef.current !== selectedDeviceId) {
        sock.emit('unsubscribe', { deviceId: prevDeviceRef.current });
      }
      if (selectedDeviceId) {
        sock.emit('subscribe', { deviceId: selectedDeviceId });
      }
      prevDeviceRef.current = selectedDeviceId;
    };

    // 'connect' fires on initial connection AND every reconnect (socket.io v4)
    sock.on('connect', doSubscribe);

    if (sock.connected) doSubscribe();

    return () => {
      sock.off('connect', doSubscribe);
    };
  }, [selectedDeviceId]);

  return { socket };
}
