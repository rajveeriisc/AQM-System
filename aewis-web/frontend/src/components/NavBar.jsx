import { NavLink } from 'react-router-dom';
import useStore from '../store';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/history', label: 'History' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/devices', label: 'Devices' },
  { to: '/settings', label: 'Settings' },
];

export default function NavBar() {
  const activeAlerts = useStore((s) => s.activeAlerts);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 hidden md:block sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium border-b-2 transition-all duration-300 ${
                  isActive
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`
              }
            >
              {label}
              {label === 'Alerts' && activeAlerts.length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 shadow-sm">
                  {activeAlerts.length}
                </span>
              )}
            </NavLink>
          ))}
        </div>
        
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors duration-200"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  );
}
