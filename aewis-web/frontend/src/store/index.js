import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Auth
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  setAuth: (user, token, refreshToken) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, token });
  },
  clearAuth: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    set({ user: null, token: null });
  },

  // Devices
  devices: [],
  isDevicesLoading: true,
  setIsDevicesLoading: (loading) => set({ isDevicesLoading: loading }),
  selectedDeviceId: localStorage.getItem('selectedDeviceId') || null,
  setDevices: (devices) => {
    set({ devices });
    // Auto-select first device if none selected
    const current = get().selectedDeviceId;
    if (!current && devices.length > 0) {
      get().selectDevice(devices[0].id);
    }
  },
  selectDevice: (deviceId) => {
    localStorage.setItem('selectedDeviceId', deviceId);
    set({ selectedDeviceId: deviceId });
  },
  updateDeviceStatus: (deviceId, status, lastSeen) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, status, ...(lastSeen ? { lastSeen } : {}) } : d
      ),
    })),

  // Live reading (updated by Socket.io)
  liveReading: null,
  setLiveReading: (reading) => set({ liveReading: reading }),

  // Reading history (last N readings for trend chart)
  readingHistory: [],
  appendReading: (reading) =>
    set((state) => ({
      readingHistory: [...state.readingHistory.slice(-500), reading],
    })),
  setReadingHistory: (readings) => set({ readingHistory: readings }),

  // Alerts
  activeAlerts: [],
  setActiveAlerts: (alerts) => set({ activeAlerts: alerts }),
  addAlert: (alert) =>
    set((state) => ({ activeAlerts: [alert, ...state.activeAlerts] })),
  resolveAlert: (alertId) =>
    set((state) => ({
      activeAlerts: state.activeAlerts.filter((a) => a.id !== alertId),
    })),
  acknowledgeAlert: (alertId) =>
    set((state) => ({
      activeAlerts: state.activeAlerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    })),

  // UI
  theme: localStorage.getItem('theme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
  tempUnit: localStorage.getItem('tempUnit') || 'C',
  setTempUnit: (unit) => {
    localStorage.setItem('tempUnit', unit);
    set({ tempUnit: unit });
  },
}));

// Apply theme on load
const theme = localStorage.getItem('theme') || 'dark';
document.documentElement.classList.toggle('dark', theme === 'dark');

export default useStore;
