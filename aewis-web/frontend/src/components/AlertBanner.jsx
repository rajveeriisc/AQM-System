import useStore from '../store';

const LEVEL_STYLE = {
  CRITICAL: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/50 dark:text-red-400',
  WARNING: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800/50 dark:text-orange-400',
};

export default function AlertBanner() {
  const activeAlerts = useStore((s) => s.activeAlerts);

  if (!activeAlerts.length) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800/50 dark:text-green-400 text-sm font-medium transition-colors duration-300 shadow-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-400 inline-block" />
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
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-colors duration-300 shadow-sm ${style}`}>
      <span className={`w-2.5 h-2.5 rounded-full inline-block animate-pulse ${worst.level === 'CRITICAL' ? 'bg-red-500 dark:bg-red-400' : 'bg-orange-500 dark:bg-orange-400'}`} />
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
