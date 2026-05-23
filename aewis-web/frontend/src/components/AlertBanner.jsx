import useStore from '../store';

const LEVEL_STYLE = {
  CRITICAL: 'bg-red-900/80 border-red-500 text-red-200',
  WARNING: 'bg-orange-900/80 border-orange-500 text-orange-200',
};

export default function AlertBanner() {
  const activeAlerts = useStore((s) => s.activeAlerts);

  if (!activeAlerts.length) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-900/40 border border-green-700 text-green-400 text-sm">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        All safe — no active alerts
      </div>
    );
  }

  const worst = activeAlerts.reduce((a, b) => {
    if (a.level === 'CRITICAL') return a;
    if (b.level === 'CRITICAL') return b;
    return a;
  });

  const style = LEVEL_STYLE[worst.level] || LEVEL_STYLE.WARNING;

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border text-sm ${style}`}>
      <span className={`w-2 h-2 rounded-full inline-block animate-pulse ${worst.level === 'CRITICAL' ? 'bg-red-400' : 'bg-orange-400'}`} />
      <span className="font-bold">{worst.level}</span>
      <span>
        {worst.pollutant?.toUpperCase()} = {worst.value?.toFixed(2)} (threshold: {worst.threshold?.toFixed(2)})
      </span>
      {activeAlerts.length > 1 && (
        <span className="ml-auto text-xs opacity-70">+{activeAlerts.length - 1} more</span>
      )}
    </div>
  );
}
