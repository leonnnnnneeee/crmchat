import React, { useState, useEffect } from 'react';

import { getSafeInitials } from '../../utils/avatarUtils';

// Assume photoCache and _authToken are passed or imported
const photoCache = {};
let _authToken = '';
export const setAvatarAuthToken = (t) => _authToken = t;

function Avatar({name, chatId, username, size=40}) {
  const colors=["#c03d33","#4fad2d","#d09306","#168acd","#8544d6","#cd4073","#2996ad","#ce671b"]
  const colorIdx = (name||"?").charCodeAt(0) % colors.length
  const initials = getSafeInitials(name);
  const [photoUrl, setPhotoUrl] = useState(photoCache[chatId] || null)
  const [failed, setFailed] = useState(false)

  useEffect(()=>{
    if (!chatId || !_authToken || failed) return
    if (photoCache[chatId]) { setPhotoUrl(photoCache[chatId]); return }
    const qs = username ? `?username=${encodeURIComponent(username)}` : ""
    fetch(`/api/chat/photo/${chatId}${qs}`, {headers:{"x-auth-token":_authToken}})
      .then(r => { if (!r.ok) throw new Error("no photo"); return r.blob() })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        photoCache[chatId] = url
        setPhotoUrl(url)
      })
      .catch(() => setFailed(true))
  }, [chatId])

  if (photoUrl && !failed) {
    return (
      <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:colors[colorIdx]}}>
        <img src={photoUrl} alt={name} width={size} height={size}
          style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
          onError={()=>setFailed(true)}/>
      </div>
    )
  }

  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:colors[colorIdx],display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.38,fontWeight:600,color:"#fff",userSelect:"none",flexShrink:0,letterSpacing:"-0.5px"}}>
      {initials}
    </div>
  )
}

export default Avatar;
