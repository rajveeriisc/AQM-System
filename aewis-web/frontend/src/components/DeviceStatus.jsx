import { fmtRelative } from '../utils/formatters';

export default function DeviceStatus({ status, lastSeen }) {
  const online = status === 'online';
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
      <span className={online ? 'text-green-400' : 'text-gray-500'}>
        {online ? 'Online' : 'Offline'}
      </span>
      {lastSeen && !online && (
        <span className="text-gray-600">· {fmtRelative(lastSeen)}</span>
      )}
    </span>
  );
}
