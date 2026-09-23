import Icon from './Icon.jsx'

const primaryNav = [
  { id: 'dashboard', label: 'Home', icon: 'home', page: 'dashboard' },
  { id: 'logs', label: 'Chart', icon: 'chart', page: 'logs' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', page: 'calendar' },
]

const secondaryNav = [
  { id: 'devices', label: 'Devices', icon: 'devices', page: 'devices' },
  { id: 'sessions', label: 'Sessions', icon: 'sessions', page: 'sessions' },
  { id: 'deleted-scans', label: 'Deleted scans', icon: 'trash', page: 'deletion-log' },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="nav-group">
        <div className="brand"><span>•••</span><b>MG</b></div>
        {primaryNav.map((item) => (
          <button
            className={`nav-button ${activePage === item.page ? 'active' : ''}`}
            key={item.id}
            onClick={() => item.page && onNavigate(item.page)}
            aria-label={item.label}
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </div>
      <div className="nav-group secondary">
        {secondaryNav.map((item) => (
          <button
            className="nav-button"
            key={item.id}
            onClick={() => item.page && onNavigate(item.page)}
            aria-label={item.label}
            title={item.label}
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </div>
    </aside>
  )
}
