import { useState } from 'react'
import CRMChat from './CRMChat.jsx'

const C = {
  bg0: '#0d0d12', bg1: '#15151e', bg2: '#1c1c28',
  border: '#2a2a3d', textPrimary: '#f0f0f8', textSecondary: '#8888aa',
  accent: '#e879f9', accentPurple: '#a855f7',
}

function Login({ onLogin }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!user || !pass) return setErr('Nhập đủ thông tin')
    setLoading(true)
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      })
      const d = await r.json()
      if (d.ok) { onLogin(d.token) }
      else setErr(d.message || 'Sai username hoặc password')
    } catch {
      // Dev mode: allow bypass
      if (user === 'Leon' && pass === 'coincu123') onLogin('dev_token')
      else setErr('Không kết nối được server')
    }
    setLoading(false)
  }

  const inp = {
    width: '100%', padding: '10px 14px', background: C.bg2,
    border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.textPrimary, fontSize: 14, outline: 'none'
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg0 }}>
      <div style={{ width: 360, padding: 32, background: C.bg1, borderRadius: 16, border: `1px solid ${C.border}` }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: C.textPrimary }}>Coincu CRM</div>
          <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>BD Sales Dashboard</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="Username" style={inp} />
          <input value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" type="password"
            style={inp} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {err && <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{
              padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
              background: `linear-gradient(135deg, ${C.accentPurple}, ${C.accent})`,
              color: '#fff', opacity: loading ? 0.7 : 1
            }}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('crm_token') || '')

  function handleLogin(t) {
    setToken(t)
    localStorage.setItem('crm_token', t)
  }

  function handleLogout() {
    setToken('')
    localStorage.removeItem('crm_token')
  }

  if (!token) return <Login onLogin={handleLogin} />

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg0 }}>
      {/* Header */}
      <div style={{
        height: 52, background: C.bg1, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', padding: '0 20px',
        justifyContent: 'space-between', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, background: `linear-gradient(135deg, ${C.accentPurple}, ${C.accent})`,
            borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
          }}>⚡</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.textPrimary }}>Coincu CRM Chat</span>
          <span style={{ fontSize: 11, color: C.textSecondary, marginLeft: 4 }}>BD Sales</span>
        </div>
        <button onClick={handleLogout}
          style={{ fontSize: 12, padding: '4px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSecondary, cursor: 'pointer' }}>
          Đăng xuất
        </button>
      </div>

      {/* CRM Chat fullscreen */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CRMChat token={token} />
      </div>
    </div>
  )
}
