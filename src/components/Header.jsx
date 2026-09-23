import Icon from './Icon.jsx'

export default function Header() {
  return (
    <header className="header">
      <h1>MangroveGuard</h1>
      <button className="date-button" type="button">
        <Icon name="calendar" />
        <b>All dates</b>
        <span>⌄</span>
      </button>
    </header>
  )
}
