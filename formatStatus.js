function formatStatus(status) {
  if (!status) return ''
  const c = status.className
  if (c === 'UserStatusOnline') return 'online'
  if (c === 'UserStatusRecently') return 'last seen recently'
  if (c === 'UserStatusLastWeek') return 'last seen within a week'
  if (c === 'UserStatusLastMonth') return 'last seen within a month'
  if (c === 'UserStatusOffline') {
    if (!status.wasOnline) return 'last seen recently'
    const diff = Math.floor(Date.now()/1000) - status.wasOnline
    if (diff < 60) return 'last seen just now'
    if (diff < 3600) return `last seen ${Math.floor(diff/60)} minutes ago`
    if (diff < 86400) return `last seen ${Math.floor(diff/3600)} hours ago`
    return `last seen ${Math.floor(diff/86400)} days ago`
  }
  return 'last seen recently'
}
module.exports = { formatStatus }
