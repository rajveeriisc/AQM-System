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
  const devices = useStore((s) => s.devices);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const setLiveReading = useStore((s) => s.setLiveReading);
  const appendReading = useStore((s) => s.appendReading);
  const addAlert = useStore((s) => s.addAlert);
  const resolveAlert = useStore((s) => s.resolveAlert);
  const updateDeviceStatus = useStore((s) => s.updateDeviceStatus);
  const prevDeviceRef = useRef(null);
  const subscribedRoomsRef = useRef(new Set());

  // Register event handlers once
  useEffect(() => {
    const sock = getSocket();
    if (!sock.connected) sock.connect();

    const onSensorUpdate = (reading) => {
      // Only update live reading for the currently selected device
      if (reading.deviceId === selectedDeviceId || !reading.deviceId) {
        setLiveReading(reading);
        appendReading(reading);
      }
    };
    const onAlertNew = (alert) => addAlert(alert);
    const onAlertResolved = ({ alertId }) => resolveAlert(alertId);
    const onDeviceStatus = ({ deviceId, status, lastSeen }) =>
      updateDeviceStatus(deviceId, status, lastSeen);

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
  }, [selectedDeviceId]);

  // Subscribe to ALL owned device rooms so device:status reaches us for every device
  useEffect(() => {
    const sock = getSocket();
    const currentIds = new Set(devices.map((d) => d.id));

    const doSubscribeAll = () => {
      // Unsubscribe rooms that are no longer in the device list
      for (const id of subscribedRoomsRef.current) {
        if (!currentIds.has(id)) {
          sock.emit('unsubscribe', { deviceId: id });
          subscribedRoomsRef.current.delete(id);
        }
      }
      // Subscribe to any new rooms
      for (const id of currentIds) {
        if (!subscribedRoomsRef.current.has(id)) {
          sock.emit('subscribe', { deviceId: id });
          subscribedRoomsRef.current.add(id);
        }
      }
    };

    sock.on('connect', doSubscribeAll);
    if (sock.connected) doSubscribeAll();

    return () => {
      sock.off('connect', doSubscribeAll);
    };
  }, [devices]);

  // Keep selected device subscription in sync (for sensor:update filtering — no room change needed
  // since we already subscribe to all device rooms above)
  useEffect(() => {
    prevDeviceRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  return { socket };
}
