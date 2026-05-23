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

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 hidden md:block">
      <div className="max-w-7xl mx-auto flex items-center gap-1">
        {NAV_ITEMS.map(({ to, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`
            }
          >
            {label}
            {label === 'Alerts' && activeAlerts.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {activeAlerts.length}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
