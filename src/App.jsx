import { useState, useEffect } from 'react'
import CRMChat from './CRMChat.jsx'

const C = {
  bg0:'#0d0d12', bg1:'#15151e', bg2:'#1c1c28', bg3:'#242433',
  border:'#2a2a3d', textPrimary:'#f0f0f8', textSecondary:'#8888aa', textMuted:'#55556a',
  accent:'#e879f9', accentPurple:'#a855f7', success:'#22c55e', danger:'#ef4444',
}

const inp = {
  width:'100%', padding:'10px 14px', background:C.bg2,
  border:`1px solid ${C.border}`, borderRadius:8,
  color:C.textPrimary, fontSize:14, outline:'none', fontFamily:'inherit'
}
const btn = (color='accent') => ({
  width:'100%', padding:'11px', borderRadius:8, border:'none', cursor:'pointer',
  fontWeight:700, fontSize:14, color:'#fff',
  background: color==='accent' ? `linear-gradient(135deg,${C.accentPurple},${C.accent})`
    : color==='green' ? C.success : color==='red' ? C.danger : C.bg3
})

// ── LOGIN SCREEN ──
function Login({ onLogin }) {
  const [user,setUser]=useState('')
  const [pass,setPass]=useState('')
  const [err,setErr]=useState('')
  const [loading,setLoading]=useState(false)

  async function handleLogin() {
    if(!user||!pass) return setErr('Nhập đủ thông tin')
    setLoading(true)
    try {
      const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user,password:pass})})
      const d = await r.json()
      if(d.ok) onLogin(d.token)
      else setErr(d.message||'Sai thông tin')
    } catch { setErr('Không kết nối được server') }
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg0}}>
      <div style={{width:360,padding:32,background:C.bg1,borderRadius:16,border:`1px solid ${C.border}`}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:32,marginBottom:8}}>⚡</div>
          <div style={{fontWeight:700,fontSize:22,color:C.textPrimary}}>Coincu CRM</div>
          <div style={{fontSize:13,color:C.textSecondary,marginTop:4}}>BD Sales Dashboard</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <input value={user} onChange={e=>setUser(e.target.value)} placeholder="Username" style={inp}/>
          <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" type="password" style={inp} onKeyDown={e=>e.key==='Enter'&&handleLogin()}/>
          {err && <div style={{fontSize:12,color:C.danger}}>{err}</div>}
          <button onClick={handleLogin} disabled={loading} style={btn()}>{loading?'Đang đăng nhập...':'Đăng nhập'}</button>
        </div>
      </div>
    </div>
  )
}

// ── TELEGRAM CONNECT SCREEN ──
function TelegramConnect({ token, onConnected }) {
  const [step,setStep]=useState('phone') // phone | otp | 2fa | done
  const [phone,setPhone]=useState('+84')
  const [code,setCode]=useState('')
  const [password,setPassword]=useState('')
  const [phoneCodeHash,setPhoneCodeHash]=useState('')
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')
  const [msg,setMsg]=useState('')

  async function sendOTP() {
    if(!phone) return setErr('Nhập số điện thoại')
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/tg/send-otp',{method:'POST',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({phone})})
      const d = await r.json()
      if(d.ok) { setPhoneCodeHash(d.phoneCodeHash); setStep('otp'); setMsg('Mã OTP đã gửi đến Telegram của bạn') }
      else setErr(d.error||'Gửi OTP thất bại')
    } catch(e) { setErr(e.message) }
    setLoading(false)
  }

  async function verifyOTP() {
    if(!code) return setErr('Nhập mã OTP')
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/tg/verify-otp',{method:'POST',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({phone,code,phoneCodeHash,password})})
      const d = await r.json()
      if(d.ok) { setStep('done'); setTimeout(onConnected, 1000) }
      else if(d.error?.includes('PASSWORD')) { setStep('2fa'); setErr('') }
      else setErr(d.error||'Xác thực thất bại')
    } catch(e) { setErr(e.message) }
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg0}}>
      <div style={{width:400,padding:32,background:C.bg1,borderRadius:16,border:`1px solid ${C.border}`}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:36,marginBottom:8}}>📱</div>
          <div style={{fontWeight:700,fontSize:20,color:C.textPrimary}}>Kết nối Telegram</div>
          <div style={{fontSize:13,color:C.textSecondary,marginTop:6,lineHeight:1.6}}>Dùng tài khoản Telegram cá nhân để chat với khách hàng</div>
        </div>

        {/* Steps indicator */}
        <div style={{display:'flex',gap:8,marginBottom:24,justifyContent:'center'}}>
          {['phone','otp','done'].map((s,i)=>(
            <div key={s} style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,
                background:step===s||((s==='phone'&&(step==='otp'||step==='done'))||(s==='otp'&&step==='done'))?C.accent:C.bg3,
                color:step===s||((s==='phone'&&(step==='otp'||step==='done'))||(s==='otp'&&step==='done'))?'#fff':C.textMuted,
                border:`1px solid ${step===s?C.accent:C.border}`}}>{i+1}</div>
              {i<2&&<div style={{width:24,height:1,background:C.border}}/>}
            </div>
          ))}
        </div>

        {step==='done' ? (
          <div style={{textAlign:'center',padding:20}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontSize:16,fontWeight:700,color:C.success}}>Kết nối thành công!</div>
            <div style={{fontSize:13,color:C.textSecondary,marginTop:8}}>Đang tải conversations...</div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {step==='phone' && <>
              <div style={{fontSize:13,color:C.textSecondary,marginBottom:4}}>Số điện thoại Telegram (có +84)</div>
              <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+84xxxxxxxxx" style={inp} onKeyDown={e=>e.key==='Enter'&&sendOTP()}/>
              <button onClick={sendOTP} disabled={loading} style={btn()}>{loading?'Đang gửi OTP...':'Gửi mã OTP 📲'}</button>
            </>}

            {(step==='otp'||step==='2fa') && <>
              {msg&&<div style={{fontSize:13,color:C.success,background:'rgba(34,197,94,0.1)',padding:'8px 12px',borderRadius:8}}>{msg}</div>}
              <div style={{fontSize:13,color:C.textSecondary}}>Nhập mã OTP từ app Telegram</div>
              <input value={code} onChange={e=>setCode(e.target.value)} placeholder="12345" style={{...inp,letterSpacing:6,textAlign:'center',fontSize:20}} maxLength={6} onKeyDown={e=>e.key==='Enter'&&verifyOTP()}/>
              {step==='2fa' && <>
                <div style={{fontSize:13,color:C.warning}}>⚠️ Tài khoản có 2FA — nhập mật khẩu Telegram</div>
                <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mật khẩu 2FA" type="password" style={inp}/>
              </>}
              <button onClick={verifyOTP} disabled={loading} style={btn()}>{loading?'Đang xác thực...':'Xác nhận ✓'}</button>
              <button onClick={()=>{setStep('phone');setCode('');setErr('');setMsg('')}} style={{...btn('none'),background:'transparent',color:C.textSecondary,border:`1px solid ${C.border}`,width:'auto',padding:'8px'}}>← Đổi số điện thoại</button>
            </>}

            {err&&<div style={{fontSize:13,color:C.danger,background:C.dangerDim||'rgba(239,68,68,0.1)',padding:'8px 12px',borderRadius:8}}>{err}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN APP ──
export default function App() {
  const [token,setToken]=useState(()=>localStorage.getItem('crm_token')||'')
  const [tgConnected,setTgConnected]=useState(false)
  const [checking,setChecking]=useState(true)

  useEffect(()=>{
    if(!token){setChecking(false);return}
    fetch('/api/tg/status',{headers:{'x-auth-token':token}})
      .then(r=>r.json())
      .then(d=>{setTgConnected(d.connected);setChecking(false)})
      .catch(()=>setChecking(false))
  },[token])

  function handleLogin(t){ setToken(t); localStorage.setItem('crm_token',t) }
  function handleLogout(){ setToken(''); localStorage.removeItem('crm_token'); setTgConnected(false) }

  if(!token) return <Login onLogin={handleLogin}/>
  if(checking) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg0}}>
      <div style={{color:C.textSecondary,fontSize:14}}>⏳ Đang kiểm tra kết nối...</div>
    </div>
  )
  if(!tgConnected) return <TelegramConnect token={token} onConnected={()=>setTgConnected(true)}/>

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',background:C.bg0}}>
      <div style={{height:52,background:C.bg1,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',padding:'0 20px',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:28,height:28,background:`linear-gradient(135deg,${C.accentPurple},${C.accent})`,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>⚡</div>
          <span style={{fontWeight:700,fontSize:15,color:C.textPrimary}}>Coincu CRM Chat</span>
          <span style={{fontSize:11,background:'rgba(34,197,94,0.15)',color:C.success,padding:'2px 8px',borderRadius:99,border:'1px solid rgba(34,197,94,0.3)'}}>● Telegram Connected</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setTgConnected(false)} style={{fontSize:12,padding:'4px 12px',background:'transparent',border:`1px solid ${C.border}`,borderRadius:6,color:C.textSecondary,cursor:'pointer'}}>Reconnect TG</button>
          <button onClick={handleLogout} style={{fontSize:12,padding:'4px 12px',background:'transparent',border:`1px solid ${C.border}`,borderRadius:6,color:C.textSecondary,cursor:'pointer'}}>Đăng xuất</button>
        </div>
      </div>
      <div style={{flex:1,overflow:'hidden'}}>
        <CRMChat token={token}/>
      </div>
    </div>
  )
}
