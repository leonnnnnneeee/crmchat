import { useState, useEffect } from "react"
import CRMChat from "./CRMChat.jsx"

// ── Telegram color palette ──
const TG = {
  bg:        "#17212b",
  panel:     "#1c2733",
  surface:   "#242f3d",
  elevated:  "#2b3a4a",
  border:    "#0d1821",
  blue:      "#2b5278",
  blueHover: "#3a6d9e",
  blueLight: "#5288c1",
  text:      "#ffffff",
  textSec:   "#708499",
  textMuted: "#4a5568",
  green:     "#4fae4e",
  red:       "#e53935",
  unread:    "#4fae4e",
}

const inp = {
  width:"100%", padding:"12px 16px", background:TG.surface,
  border:`1px solid ${TG.elevated}`, borderRadius:10,
  color:TG.text, fontSize:15, outline:"none", fontFamily:"inherit",
  transition:"border-color .15s",
}
const primaryBtn = {
  width:"100%", padding:"13px", borderRadius:10, border:"none",
  cursor:"pointer", fontWeight:600, fontSize:15, color:"#fff",
  background:TG.blueLight, transition:"background .15s",
}

// ── LOGIN ──
function Login({ onLogin }) {
  const [user,setUser] = useState("")
  const [pass,setPass] = useState("")
  const [err,setErr]   = useState("")
  const [busy,setBusy] = useState(false)

  async function submit() {
    if (!user || !pass) return setErr("Nhập đủ thông tin")
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/login", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({username:user, password:pass})
      })
      const d = await r.json()
      if (d.ok) onLogin(d.token)
      else setErr(d.message || "Sai thông tin đăng nhập")
    } catch { setErr("Không kết nối được server") }
    setBusy(false)
  }

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:TG.bg}}>
      <div style={{width:360,padding:"40px 32px",background:TG.panel,borderRadius:16,border:`1px solid ${TG.elevated}`}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:72,height:72,background:TG.blueLight,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 16px"}}>⚡</div>
          <div style={{fontWeight:700,fontSize:22,color:TG.text}}>Coincu CRM</div>
          <div style={{fontSize:14,color:TG.textSec,marginTop:6}}>Sign in to your account</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input value={user} onChange={e=>setUser(e.target.value)} placeholder="Username" style={inp}
            onFocus={e=>e.target.style.borderColor=TG.blueLight} onBlur={e=>e.target.style.borderColor=TG.elevated}/>
          <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" type="password" style={inp}
            onFocus={e=>e.target.style.borderColor=TG.blueLight} onBlur={e=>e.target.style.borderColor=TG.elevated}
            onKeyDown={e=>e.key==="Enter"&&submit()}/>
          {err && <div style={{fontSize:13,color:TG.red,padding:"8px 12px",background:"rgba(229,57,53,.1)",borderRadius:8}}>{err}</div>}
          <button onClick={submit} disabled={busy} style={{...primaryBtn,opacity:busy?.7:1}}>
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TELEGRAM OTP CONNECT ──
function TelegramConnect({ token, onConnected }) {
  const [step,setStep]   = useState("phone")
  const [phone,setPhone] = useState("+84")
  const [code,setCode]   = useState("")
  const [pw,setPw]       = useState("")
  const [hash,setHash]   = useState("")
  const [busy,setBusy]   = useState(false)
  const [err,setErr]     = useState("")

  async function sendOTP() {
    if (!phone.trim()) return setErr("Nhập số điện thoại")
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/tg/send-otp",{
        method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify({phone})
      })
      const d = await r.json()
      if (d.ok) { setHash(d.phoneCodeHash); setStep("otp") }
      else setErr(d.error || "Gửi OTP thất bại")
    } catch(e) { setErr(e.message) }
    setBusy(false)
  }

  async function verifyOTP() {
    if (!code.trim()) return setErr("Nhập mã OTP")
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/tg/verify-otp",{
        method:"POST", headers:{"Content-Type":"application/json","x-auth-token":token},
        body: JSON.stringify({phone, code, phoneCodeHash:hash, password:pw})
      })
      const d = await r.json()
      if (d.ok) { setStep("done"); setTimeout(onConnected, 1200) }
      else if (d.error?.includes("PASSWORD")) { setStep("2fa"); setErr("") }
      else setErr(d.error || "Xác thực thất bại")
    } catch(e) { setErr(e.message) }
    setBusy(false)
  }

  const StepDot = ({n,active,done}) => (
    <div style={{display:"flex",alignItems:"center",gap:0}}>
      <div style={{
        width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:13,fontWeight:700,
        background: done||active ? TG.blueLight : TG.surface,
        color: done||active ? "#fff" : TG.textMuted,
        border: `2px solid ${done||active ? TG.blueLight : TG.elevated}`,
        transition:"all .2s"
      }}>{done ? "✓" : n}</div>
    </div>
  )

  const stepNum = step==="phone"?1:step==="otp"||step==="2fa"?2:3

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:TG.bg}}>
      <div style={{width:420,padding:"40px 36px",background:TG.panel,borderRadius:16,border:`1px solid ${TG.elevated}`}}>
        {/* Icon */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:80,height:80,background:"linear-gradient(135deg,#229ED9,#1a7ab5)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 14px"}}>📱</div>
          <div style={{fontWeight:700,fontSize:20,color:TG.text}}>Connect Telegram</div>
          <div style={{fontSize:13,color:TG.textSec,marginTop:6,lineHeight:1.6}}>Dùng tài khoản Telegram cá nhân<br/>để chat trực tiếp với khách hàng</div>
        </div>

        {/* Steps */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:28}}>
          <StepDot n={1} active={stepNum===1} done={stepNum>1}/>
          <div style={{width:40,height:2,background:stepNum>1?TG.blueLight:TG.elevated,transition:"background .3s"}}/>
          <StepDot n={2} active={stepNum===2} done={stepNum>2}/>
          <div style={{width:40,height:2,background:stepNum>2?TG.blueLight:TG.elevated,transition:"background .3s"}}/>
          <StepDot n={3} active={stepNum===3} done={false}/>
        </div>

        {step === "done" ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:52,marginBottom:14}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,color:TG.green}}>Connected!</div>
            <div style={{fontSize:13,color:TG.textSec,marginTop:8}}>Đang tải conversations...</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {step === "phone" && <>
              <div>
                <div style={{fontSize:13,color:TG.textSec,marginBottom:8,fontWeight:500}}>Phone Number</div>
                <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+84 xxx xxx xxx"
                  style={{...inp,fontSize:17,letterSpacing:1}}
                  onFocus={e=>e.target.style.borderColor=TG.blueLight} onBlur={e=>e.target.style.borderColor=TG.elevated}
                  onKeyDown={e=>e.key==="Enter"&&sendOTP()}/>
                <div style={{fontSize:12,color:TG.textMuted,marginTop:6}}>Nhập đầy đủ mã quốc gia. Ví dụ: +84912345678</div>
              </div>
              <button onClick={sendOTP} disabled={busy} style={{...primaryBtn,opacity:busy?.7:1}}>
                {busy ? "Đang gửi..." : "Gửi mã OTP →"}
              </button>
            </>}

            {(step === "otp" || step === "2fa") && <>
              <div style={{padding:"10px 14px",background:"rgba(79,174,78,.1)",borderRadius:8,border:"1px solid rgba(79,174,78,.2)",fontSize:13,color:TG.green}}>
                ✓ Mã OTP đã gửi đến Telegram của bạn
              </div>
              <div>
                <div style={{fontSize:13,color:TG.textSec,marginBottom:8,fontWeight:500}}>Mã xác nhận</div>
                <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="12345"
                  maxLength={6} style={{...inp,fontSize:28,letterSpacing:12,textAlign:"center",fontWeight:700}}
                  onFocus={e=>e.target.style.borderColor=TG.blueLight} onBlur={e=>e.target.style.borderColor=TG.elevated}
                  onKeyDown={e=>e.key==="Enter"&&verifyOTP()} autoFocus/>
              </div>
              {step === "2fa" && (
                <div>
                  <div style={{fontSize:13,color:TG.textSec,marginBottom:8,fontWeight:500}}>Mật khẩu 2FA</div>
                  <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="Cloud password" type="password"
                    style={inp} onFocus={e=>e.target.style.borderColor=TG.blueLight} onBlur={e=>e.target.style.borderColor=TG.elevated}/>
                  <div style={{fontSize:12,color:TG.textMuted,marginTop:6}}>Tài khoản của bạn có bật 2-Step Verification</div>
                </div>
              )}
              <button onClick={verifyOTP} disabled={busy} style={{...primaryBtn,opacity:busy?.7:1}}>
                {busy ? "Đang xác thực..." : "Xác nhận ✓"}
              </button>
              <button onClick={()=>{setStep("phone");setCode("");setErr("")}}
                style={{padding:"10px",background:"transparent",border:`1px solid ${TG.elevated}`,borderRadius:10,color:TG.textSec,cursor:"pointer",fontSize:14}}>
                ← Đổi số điện thoại
              </button>
            </>}

            {err && (
              <div style={{padding:"10px 14px",background:"rgba(229,57,53,.1)",border:"1px solid rgba(229,57,53,.25)",borderRadius:8,fontSize:13,color:TG.red}}>
                ⚠ {err}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN APP ──
export default function App() {
  const [token,setToken]       = useState(()=>localStorage.getItem("crm_token")||"")
  const [tgOk,setTgOk]         = useState(false)
  const [checking,setChecking] = useState(true)

  useEffect(()=>{
    if (!token) { setChecking(false); return }
    const controller = new AbortController()
    const timeout = setTimeout(()=>{ controller.abort(); setChecking(false) }, 5000)
    fetch("/api/tg/status",{headers:{"x-auth-token":token}, signal:controller.signal})
      .then(r=>r.json())
      .then(d=>{ clearTimeout(timeout); setTgOk(d.connected); setChecking(false) })
      .catch(()=>{ clearTimeout(timeout); setChecking(false) })
  },[token])

  function login(t) { setToken(t); localStorage.setItem("crm_token",t) }
  function logout() { setToken(""); setTgOk(false); localStorage.removeItem("crm_token") }

  if (!token) return <Login onLogin={login}/>

  if (checking) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:TG.bg}}>
      <div style={{color:TG.textSec,fontSize:15}}>Connecting...</div>
    </div>
  )

  if (!tgOk) return <TelegramConnect token={token} onConnected={()=>setTgOk(true)}/>

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:TG.bg,overflow:"hidden"}}>
      {/* Top bar */}
      <div style={{height:56,background:TG.panel,borderBottom:`1px solid ${TG.border}`,display:"flex",alignItems:"center",padding:"0 20px",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:34,height:34,background:TG.blueLight,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>⚡</div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:TG.text,lineHeight:1.2}}>Coincu CRM</div>
            <div style={{fontSize:11,color:TG.green}}>● Telegram connected</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTgOk(false)}
            style={{fontSize:12,padding:"6px 14px",background:TG.surface,border:`1px solid ${TG.elevated}`,borderRadius:8,color:TG.textSec,cursor:"pointer"}}>
            Reconnect TG
          </button>
          <button onClick={logout}
            style={{fontSize:12,padding:"6px 14px",background:TG.surface,border:`1px solid ${TG.elevated}`,borderRadius:8,color:TG.textSec,cursor:"pointer"}}>
            Sign out
          </button>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden"}}>
        <CRMChat token={token}/>
      </div>
    </div>
  )
}
