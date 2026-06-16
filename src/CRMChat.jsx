import { useState, useEffect, useRef, useCallback } from 'react'

// ── DESIGN TOKENS ─────────────────────────────────
const C = {
  bg0: '#0d0d12',
  bg1: '#15151e',
  bg2: '#1c1c28',
  bg3: '#242433',
  border: '#2a2a3d',
  borderHover: '#3d3d55',
  textPrimary: '#f0f0f8',
  textSecondary: '#8888aa',
  textMuted: '#55556a',
  accent: '#e879f9',
  accentDim: 'rgba(232,121,249,0.15)',
  accentPurple: '#a855f7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  dangerDim: 'rgba(239,68,68,0.12)',
}

// ── STAGE CONFIG ──────────────────────────────────
const STAGES = {
  'New':         { color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  'Contacted':   { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  'Interested':  { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  'Negotiating': { color: '#e879f9', bg: 'rgba(232,121,249,0.15)' },
  'Closed Won':  { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  'Closed Lost': { color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
}

// ── TEMPLATES ─────────────────────────────────────
const TEMPLATES = [
  { id: 'first_outreach',  cat: 'Outreach',     label: 'First Outreach',           text: 'Hi [Name], I\'m Leon from Coincu — we help Web3 projects get media visibility through Coincu PR and CMC News placements. Is your team focused on any upcoming milestone or campaign?' },
  { id: 'followup_seen',   cat: 'Follow-up',    label: 'Follow-up after Seen',     text: 'Hey [Name], just checking in — did you get a chance to look at what I shared? Happy to answer any questions or adjust the proposal.' },
  { id: 'what_we_sell',   cat: 'Pitch',         label: 'Client asks what we sell', text: 'Fair question. We mainly help Web3 projects get visibility through Coincu PR and CMC News placement. Is your current focus more awareness, users, or credibility before a milestone?' },
  { id: 'no_budget',      cat: 'Objection',     label: 'No budget',                text: 'Got it, budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter? We can keep it lightweight to start.' },
  { id: 'no_convert',     cat: 'Objection',     label: 'Media doesn\'t convert',   text: 'That\'s fair — direct conversion isn\'t the main goal with PR. It\'s more about the credibility layer that helps everything else convert better: ads, community, investor trust.' },
  { id: 'raising',        cat: 'Context',       label: 'Client raising funds',     text: 'That\'s actually great timing for visibility — investors do check media presence. Would it make sense to have Coincu coverage ready before your next round closes?' },
  { id: 'users',          cat: 'Context',       label: 'Focused on users/growth',  text: 'Got it, that makes sense. Are you collecting feedback mostly from users now, or also preparing visibility for the next public campaign?' },
  { id: 'agency',         cat: 'Context',       label: 'Client is agency',         text: 'Good to know — do you typically handle media/PR in-house or bring in partners? We work well with agencies on a referral or reseller model too.' },
  { id: 'referral',       cat: 'Partnership',   label: 'Offer referral',           text: 'By the way — if you know any Web3 projects who need PR or CMC News placement, we offer a referral commission on closed deals. Just FYI.' },
  { id: 'pitch_pr',       cat: 'Pitch',         label: 'Pitch Coincu PR',          text: 'Coincu PR gets your project in front of 500K+ monthly readers — crypto investors, traders, enthusiasts. Great for announcement visibility and SEO. Want me to send the rate card?' },
  { id: 'pitch_cmc',      cat: 'Pitch',         label: 'Pitch CMC News',           text: 'CMC News puts your content directly on CoinMarketCap — one of the highest-traffic crypto sites. Strong for credibility and token visibility before TGE or a campaign. Interested?' },
  { id: 'pitch_banner',   cat: 'Pitch',         label: 'Pitch Banner Ads',         text: 'We also run banner placements on Coincu — good for retargeting during a campaign window. Worth a look if you\'re running something soon.' },
  { id: 'closing',        cat: 'Closing',       label: 'Closing',                  text: 'Based on what you\'ve shared, I think [service] would be the best fit. Want me to put together a quick proposal? I can have it ready today.' },
]

// ── MOCK LEADS ────────────────────────────────────
const MOCK_LEADS = [
  {
    id: 'lead_001', contactName: 'Aris Christofi', projectName: 'OmegaFi Protocol',
    website: 'https://omegafi.io', telegram: '@aris_omegafi', email: 'aris@omegafi.io',
    source: 'Telegram', stage: 'Negotiating', priority: 'High',
    serviceInterest: ['Coincu PR', 'CMC News'], budgetRange: '$500-$2,000',
    probabilityToClose: 65, expectedDealValue: 1200,
    lastContactedAt: '2026-06-15', nextFollowUpAt: '2026-06-18',
    tags: ['CMC', 'PR', 'TGE Soon'],
    notes: [{ id: 'n1', content: 'Client wants CMC News before TGE. Budget approved internally.', createdAt: '2026-06-15' }],
    conversations: [
      { id: 'm1', sender: 'client', content: 'Can you send more details about CMC News?', createdAt: '2026-06-15T10:00:00Z', channel: 'telegram' },
      { id: 'm2', sender: 'me',     content: 'Sure! CMC News puts your content directly on CoinMarketCap — strong credibility before TGE.', createdAt: '2026-06-15T10:02:00Z', channel: 'telegram' },
      { id: 'm3', sender: 'client', content: 'What\'s the pricing?', createdAt: '2026-06-15T10:05:00Z', channel: 'telegram' },
      { id: 'm4', sender: 'me',     content: 'CMC News starts at $800, Coincu PR from $300. Want a bundle deal?', createdAt: '2026-06-15T10:07:00Z', channel: 'telegram' },
    ]
  },
  {
    id: 'lead_002', contactName: 'Sophie Zhang', projectName: 'NexLayer L2',
    website: 'https://nexlayer.xyz', telegram: '@sophie_nexlayer', email: 'sophie@nexlayer.xyz',
    source: 'Referral', stage: 'Interested', priority: 'High',
    serviceInterest: ['CMC News', 'Sponsored Article'], budgetRange: '$1,000-$3,000',
    probabilityToClose: 50, expectedDealValue: 1800,
    lastContactedAt: '2026-06-14', nextFollowUpAt: '2026-06-17',
    tags: ['L2', 'Series A'],
    notes: [{ id: 'n2', content: 'Launching mainnet July. Needs credibility for investors.', createdAt: '2026-06-14' }],
    conversations: [
      { id: 'm5', sender: 'me',     content: 'Hi Sophie, congrats on the mainnet progress! Wanted to share how Coincu PR could support NexLayer\'s launch.', createdAt: '2026-06-13T09:00:00Z', channel: 'telegram' },
      { id: 'm6', sender: 'client', content: 'Interesting. We\'re raising a Series A — need credibility more than impressions.', createdAt: '2026-06-14T11:00:00Z', channel: 'telegram' },
    ]
  },
  {
    id: 'lead_003', contactName: 'Marco Rossi', projectName: 'VaultDAO',
    website: 'https://vaultdao.fi', telegram: '@marco_vaultdao', email: null,
    source: 'Telegram', stage: 'Contacted', priority: 'Medium',
    serviceInterest: ['Coincu PR'], budgetRange: '< $500',
    probabilityToClose: 25, expectedDealValue: 300,
    lastContactedAt: '2026-06-12', nextFollowUpAt: '2026-06-20',
    tags: ['DeFi', 'Cold'],
    notes: [],
    conversations: [
      { id: 'm7', sender: 'me',     content: 'Hi Marco, I\'m Leon from Coincu. We help DeFi projects get visibility. VaultDAO looks interesting — any upcoming announcements?', createdAt: '2026-06-12T08:00:00Z', channel: 'telegram' },
      { id: 'm8', sender: 'client', content: 'We\'re focused on user feedback right now, not marketing.', createdAt: '2026-06-12T15:00:00Z', channel: 'telegram' },
    ]
  },
  {
    id: 'lead_004', contactName: 'Lena Park', projectName: 'ZeroGas Exchange',
    website: 'https://zerogas.io', telegram: '@lena_zerogas', email: 'lena@zerogas.io',
    source: 'Inbound', stage: 'New', priority: 'Medium',
    serviceInterest: ['Banner Ads', 'Coincu PR'], budgetRange: '$500-$1,000',
    probabilityToClose: 30, expectedDealValue: 600,
    lastContactedAt: null, nextFollowUpAt: '2026-06-17',
    tags: ['Exchange', 'New'],
    notes: [], conversations: []
  },
  {
    id: 'lead_005', contactName: 'David Okonkwo', projectName: 'ChainLink Africa',
    website: 'https://chainlinkafrica.io', telegram: '@david_cla', email: 'david@chainlinkafrica.io',
    source: 'Email', stage: 'Closed Won', priority: 'Low',
    serviceInterest: ['Coincu PR', 'Sponsored Article'], budgetRange: '$500-$2,000',
    probabilityToClose: 100, expectedDealValue: 800,
    lastContactedAt: '2026-06-01', nextFollowUpAt: null,
    tags: ['Closed', 'PR'],
    notes: [{ id: 'n3', content: 'Deal closed. Article published June 1. Follow up in 3 months.', createdAt: '2026-06-01' }],
    conversations: [
      { id: 'm9',  sender: 'me',     content: 'Great working with you David! The article went live today.', createdAt: '2026-06-01T12:00:00Z', channel: 'email' },
      { id: 'm10', sender: 'client', content: 'Looks great! Will reach out again for the next campaign.', createdAt: '2026-06-01T14:00:00Z', channel: 'email' },
    ]
  },
]

// ── AI SUGGEST ────────────────────────────────────
function aiSuggest(lead) {
  const lastMsg = [...lead.conversations].reverse().find(m => m.sender === 'client')?.content?.toLowerCase() || ''
  if (lastMsg.includes('feedback') || lastMsg.includes('users')) {
    return 'Got it, that makes sense. Are you collecting feedback mostly from users now, or also preparing visibility for the next public campaign?'
  }
  if ((lastMsg.includes('what') || lastMsg.includes('sell')) && (lastMsg.includes('sell') || lastMsg.includes('offer'))) {
    return `Fair question. We mainly help Web3 projects get visibility through Coincu PR and CMC News placement. Is your current focus more awareness, users, or credibility before a milestone?`
  }
  if (lastMsg.includes('budget') || lastMsg.includes('expensive') || lastMsg.includes('price')) {
    return "Got it, budget timing is always a factor. Are you raising soon, or is this more of a timing issue for next quarter?"
  }
  if (lastMsg.includes('raising') || lastMsg.includes('round') || lastMsg.includes('investors')) {
    return "That's actually great timing for visibility — investors do check media presence. Would it make sense to have Coincu coverage ready before your next round closes?"
  }
  if (lead.stage === 'Negotiating') {
    return `Based on what we discussed, I think ${lead.serviceInterest?.[0] || 'Coincu PR'} would be the best fit. Want me to put together a quick proposal?`
  }
  return `Thanks for the context. What's the main goal for ${lead.projectName} right now — awareness, credibility, or users?`
}

// ── HELPER COMPONENTS ─────────────────────────────
function StageBadge({ stage }) {
  const s = STAGES[stage] || STAGES['New']
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}40`,
      padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap'
    }}>{stage}</span>
  )
}

function Avatar({ name, size = 36 }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  const colors = ['#6366f1', '#a855f7', '#e879f9', '#3b82f6', '#22c55e', '#f59e0b']
  const color = colors[name?.charCodeAt(0) % colors.length] || colors[0]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color + '33',
      border: `2px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color, flexShrink: 0
    }}>{initials}</div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm'
    if (diff < 86400000) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  } catch { return '' }
}

// ── MAIN CRM CHAT COMPONENT ───────────────────────
export default function CRMChat({ token, initialLeadId, onOpenLeadDetail }) {
  const [leads, setLeads] = useState(MOCK_LEADS)
  const [selectedId, setSelectedId] = useState(initialLeadId || null)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('all')
  const [filterService, setFilterService] = useState('all')
  const [msgInput, setMsgInput] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestedText, setAiSuggestedText] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [sending, setSending] = useState(false)
  const [templateCat, setTemplateCat] = useState('all')
  const messagesEndRef = useRef(null)

  const selected = leads.find(l => l.id === selectedId)

  // Auto-select first lead
  useEffect(() => {
    if (!selectedId && leads.length > 0) setSelectedId(leads[0].id)
  }, [leads])

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.conversations?.length])

  // Select from external (leads tab)
  useEffect(() => {
    if (initialLeadId) setSelectedId(initialLeadId)
  }, [initialLeadId])

  // Filter leads
  const filteredLeads = leads.filter(l => {
    const matchSearch = !search ||
      l.contactName.toLowerCase().includes(search.toLowerCase()) ||
      l.projectName.toLowerCase().includes(search.toLowerCase())
    const matchStage = filterStage === 'all' || l.stage === filterStage
    const matchService = filterService === 'all' || l.serviceInterest?.includes(filterService)
    return matchSearch && matchStage && matchService
  })

  function sendMessage() {
    if (!msgInput.trim() || !selected) return
    setSending(true)
    const newMsg = {
      id: 'msg_' + Date.now(),
      sender: 'me',
      content: msgInput.trim(),
      createdAt: new Date().toISOString(),
      channel: 'manual'
    }
    setLeads(prev => prev.map(l =>
      l.id === selected.id
        ? { ...l, conversations: [...l.conversations, newMsg], lastContactedAt: new Date().toISOString().split('T')[0] }
        : l
    ))
    setMsgInput('')
    setAiSuggestedText('')
    setTimeout(() => setSending(false), 300)
  }

  function handleAISuggest() {
    if (!selected) return
    setAiSuggesting(true)
    setTimeout(() => {
      setAiSuggestedText(aiSuggest(selected))
      setAiSuggesting(false)
    }, 800)
  }

  function addNote() {
    if (!noteInput.trim() || !selected) return
    const note = { id: 'note_' + Date.now(), content: noteInput.trim(), createdAt: new Date().toISOString().split('T')[0] }
    setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, notes: [...l.notes, note] } : l))
    setNoteInput('')
    setAddingNote(false)
  }

  function updateLeadField(field, value) {
    setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, [field]: value } : l))
  }

  const panelStyle = { background: C.bg1, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const inputStyle = {
    background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.textPrimary, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
  }

  const allServices = ['Coincu PR', 'CMC News', 'Banner Ads', 'Sponsored Article', 'Telegram Ads']
  const templateCats = ['all', ...new Set(TEMPLATES.map(t => t.cat))]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '280px 1fr 320px',
      height: 'calc(100vh - 56px)', background: C.bg0,
      fontFamily: "'DM Sans','Helvetica Neue',sans-serif"
    }}>

      {/* ── COL 1: CONVERSATION LIST ── */}
      <div style={{ ...panelStyle, borderRight: `1px solid ${C.border}` }}>
        {/* Search */}
        <div style={{ padding: '12px 12px 8px' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search leads..."
            style={{ ...inputStyle, fontSize: 12 }}
          />
        </div>

        {/* Filters */}
        <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
            style={{ ...inputStyle, fontSize: 11, padding: '5px 8px', flex: 1 }}>
            <option value="all">All stages</option>
            {Object.keys(STAGES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterService} onChange={e => setFilterService(e.target.value)}
            style={{ ...inputStyle, fontSize: 11, padding: '5px 8px', flex: 1 }}>
            <option value="all">All services</option>
            {allServices.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Lead count */}
        <div style={{ padding: '0 12px 8px', fontSize: 11, color: C.textMuted }}>
          {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
        </div>

        {/* Lead cards */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredLeads.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              No leads found
            </div>
          )}
          {filteredLeads.map(lead => {
            const lastMsg = lead.conversations?.[lead.conversations.length - 1]
            const isSelected = lead.id === selectedId
            return (
              <div key={lead.id} onClick={() => setSelectedId(lead.id)}
                style={{
                  padding: '12px 14px', cursor: 'pointer',
                  borderBottom: `1px solid ${C.border}`,
                  background: isSelected ? C.bg3 : 'transparent',
                  borderLeft: isSelected ? `3px solid ${C.accent}` : '3px solid transparent',
                  transition: 'all 0.1s',
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Avatar name={lead.contactName} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.contactName}
                      </span>
                      <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, marginLeft: 6 }}>
                        {formatTime(lastMsg?.createdAt || lead.lastContactedAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.projectName}
                    </div>
                    {lastMsg && (
                      <div style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lastMsg.sender === 'me' ? '↗ ' : ''}{lastMsg.content}
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <StageBadge stage={lead.stage} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── COL 2: CHAT WINDOW ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: C.bg0, overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 14 }}>
            Select a lead to start chatting
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{
              padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 12, background: C.bg1
            }}>
              <Avatar name={selected.contactName} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.textPrimary }}>{selected.contactName}</div>
                <div style={{ fontSize: 12, color: C.textSecondary }}>{selected.projectName}</div>
              </div>
              <StageBadge stage={selected.stage} />
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.telegram && (
                  <a href={`https://t.me/${selected.telegram.replace('@', '')}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, padding: '5px 10px', background: C.bg3, color: '#229ED9', border: `1px solid ${C.border}`, borderRadius: 6, textDecoration: 'none' }}>
                    📱 TG
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`}
                    style={{ fontSize: 11, padding: '5px 10px', background: C.bg3, color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, textDecoration: 'none' }}>
                    📧 Email
                  </a>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selected.conversations.length === 0 && (
                <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, marginTop: 40 }}>
                  No messages yet — use a template to start the conversation
                </div>
              )}
              {selected.conversations.map(msg => (
                <div key={msg.id} style={{
                  display: 'flex', flexDirection: msg.sender === 'me' ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: 8
                }}>
                  {msg.sender === 'client' && <Avatar name={selected.contactName} size={28} />}
                  <div style={{ maxWidth: '72%' }}>
                    <div style={{
                      padding: '10px 14px', borderRadius: msg.sender === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.sender === 'me' ? `linear-gradient(135deg, ${C.accentPurple}, ${C.accent})` : C.bg2,
                      color: msg.sender === 'me' ? '#fff' : C.textPrimary,
                      fontSize: 13, lineHeight: 1.5,
                      border: msg.sender === 'client' ? `1px solid ${C.border}` : 'none',
                    }}>
                      {msg.content}
                    </div>
                    <div style={{
                      fontSize: 10, color: C.textMuted, marginTop: 3,
                      textAlign: msg.sender === 'me' ? 'right' : 'left'
                    }}>
                      {formatTime(msg.createdAt)} {msg.channel && msg.channel !== 'manual' ? `· ${msg.channel}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggest bar */}
            {aiSuggestedText && (
              <div style={{
                margin: '0 24px 8px', padding: '10px 14px',
                background: C.accentDim, border: `1px solid ${C.accent}44`,
                borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start'
              }}>
                <span style={{ fontSize: 12, color: C.accent, fontWeight: 600, flexShrink: 0 }}>✨ AI</span>
                <span style={{ fontSize: 13, color: C.textPrimary, flex: 1, lineHeight: 1.5 }}>{aiSuggestedText}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setMsgInput(aiSuggestedText); setAiSuggestedText('') }}
                    style={{ fontSize: 11, padding: '4px 10px', background: C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                    Use
                  </button>
                  <button onClick={() => setAiSuggestedText('')}
                    style={{ fontSize: 11, padding: '4px 8px', background: C.bg3, color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Template picker */}
            {showTemplates && (
              <div style={{
                margin: '0 24px 8px', background: C.bg2, border: `1px solid ${C.border}`,
                borderRadius: 12, overflow: 'hidden', maxHeight: 260
              }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, overflowX: 'auto' }}>
                  {templateCats.map(cat => (
                    <button key={cat} onClick={() => setTemplateCat(cat)}
                      style={{
                        fontSize: 11, padding: '3px 10px', border: 'none', borderRadius: 99, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500,
                        background: templateCat === cat ? C.accent : C.bg3,
                        color: templateCat === cat ? '#fff' : C.textSecondary,
                      }}>
                      {cat === 'all' ? 'All' : cat}
                    </button>
                  ))}
                  <button onClick={() => setShowTemplates(false)}
                    style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px', background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 200 }}>
                  {TEMPLATES.filter(t => templateCat === 'all' || t.cat === templateCat).map(t => (
                    <div key={t.id}
                      onClick={() => { setMsgInput(t.text); setShowTemplates(false) }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg3}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 2 }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: C.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input area */}
            <div style={{ padding: '12px 24px 16px', borderTop: `1px solid ${C.border}`, background: C.bg1 }}>
              <textarea
                value={msgInput} onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                rows={3}
                style={{
                  ...inputStyle, resize: 'none', marginBottom: 10, lineHeight: 1.5,
                  fontFamily: 'inherit'
                }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setShowTemplates(v => !v)}
                  style={{
                    fontSize: 12, padding: '7px 14px', border: `1px solid ${C.border}`,
                    background: showTemplates ? C.accentDim : C.bg3, color: showTemplates ? C.accent : C.textSecondary,
                    borderRadius: 8, cursor: 'pointer', fontWeight: 500
                  }}>
                  📋 Templates
                </button>
                <button onClick={handleAISuggest} disabled={aiSuggesting}
                  style={{
                    fontSize: 12, padding: '7px 14px', border: `1px solid ${C.border}`,
                    background: C.bg3, color: C.accent, borderRadius: 8, cursor: 'pointer', fontWeight: 500,
                    opacity: aiSuggesting ? 0.6 : 1
                  }}>
                  {aiSuggesting ? '⏳ Thinking...' : '✨ AI Suggest'}
                </button>
                <div style={{ flex: 1 }} />
                <button onClick={sendMessage} disabled={!msgInput.trim() || sending}
                  style={{
                    fontSize: 13, padding: '7px 20px', border: 'none',
                    background: msgInput.trim() ? `linear-gradient(135deg, ${C.accentPurple}, ${C.accent})` : C.bg3,
                    color: msgInput.trim() ? '#fff' : C.textMuted,
                    borderRadius: 8, cursor: msgInput.trim() ? 'pointer' : 'default',
                    fontWeight: 600, transition: 'all 0.2s'
                  }}>
                  Send ↑
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── COL 3: CUSTOMER PROFILE PANEL ── */}
      <div style={{ ...panelStyle, borderLeft: `1px solid ${C.border}`, borderRight: 'none', overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 13, marginTop: 40 }}>
            Select a lead
          </div>
        ) : (
          <div>
            {/* Profile header */}
            <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
              <Avatar name={selected.contactName} size={56} />
              <div style={{ marginTop: 10, fontWeight: 700, fontSize: 16, color: C.textPrimary }}>{selected.contactName}</div>
              <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 8 }}>{selected.projectName}</div>
              <StageBadge stage={selected.stage} />
            </div>

            {/* Contact info */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Contact</div>
              {selected.telegram && (
                <div style={{ fontSize: 12, color: '#229ED9', marginBottom: 6 }}>📱 {selected.telegram}</div>
              )}
              {selected.email && (
                <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 6 }}>📧 {selected.email}</div>
              )}
              {selected.website && (
                <a href={selected.website} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: C.accentPurple, display: 'block', marginBottom: 6, textDecoration: 'none' }}>
                  🌐 {selected.website.replace('https://', '')}
                </a>
              )}
              <div style={{ fontSize: 11, color: C.textMuted }}>Source: {selected.source}</div>
            </div>

            {/* Deal info */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Deal</div>

              {/* Stage */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Stage</div>
                <select value={selected.stage} onChange={e => updateLeadField('stage', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }}>
                  {Object.keys(STAGES).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Probability */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Probability</span>
                  <span style={{ color: C.accent, fontWeight: 600 }}>{selected.probabilityToClose}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={selected.probabilityToClose}
                  onChange={e => updateLeadField('probabilityToClose', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: C.accent }} />
              </div>

              {/* Deal value */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Expected Value (USD)</div>
                <input type="number" value={selected.expectedDealValue}
                  onChange={e => updateLeadField('expectedDealValue', parseInt(e.target.value) || 0)}
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }} />
              </div>

              {/* Follow-up date */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Next Follow-up</div>
                <input type="date" value={selected.nextFollowUpAt || ''}
                  onChange={e => updateLeadField('nextFollowUpAt', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }} />
              </div>
            </div>

            {/* Services */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Service Interest</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {allServices.map(svc => {
                  const active = selected.serviceInterest?.includes(svc)
                  return (
                    <button key={svc} onClick={() => {
                      const curr = selected.serviceInterest || []
                      updateLeadField('serviceInterest', active ? curr.filter(s => s !== svc) : [...curr, svc])
                    }}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 99, cursor: 'pointer', fontWeight: 500,
                        background: active ? C.accentDim : C.bg3,
                        color: active ? C.accent : C.textMuted,
                        border: active ? `1px solid ${C.accent}44` : `1px solid ${C.border}`,
                      }}>
                      {svc}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tags */}
            {selected.tags?.length > 0 && (
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {selected.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: C.bg3, color: C.textSecondary, border: `1px solid ${C.border}`
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</div>
                <button onClick={() => setAddingNote(v => !v)}
                  style={{ fontSize: 11, padding: '2px 8px', background: C.bg3, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, cursor: 'pointer' }}>
                  + Add
                </button>
              </div>
              {addingNote && (
                <div style={{ marginBottom: 8 }}>
                  <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)}
                    placeholder="Add a note..."
                    rows={2}
                    style={{ ...inputStyle, resize: 'none', fontSize: 12, marginBottom: 6, fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={addNote}
                      style={{ fontSize: 11, padding: '5px 12px', background: C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                      Save
                    </button>
                    <button onClick={() => setAddingNote(false)}
                      style={{ fontSize: 11, padding: '5px 10px', background: C.bg3, color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {selected.notes?.length === 0 && !addingNote && (
                <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>No notes yet</div>
              )}
              {selected.notes?.map(note => (
                <div key={note.id} style={{
                  padding: '8px 10px', background: C.bg2, borderRadius: 7,
                  border: `1px solid ${C.border}`, marginBottom: 6
                }}>
                  <div style={{ fontSize: 12, color: C.textPrimary, lineHeight: 1.5, marginBottom: 3 }}>{note.content}</div>
                  <div style={{ fontSize: 10, color: C.textMuted }}>{note.createdAt}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {onOpenLeadDetail && (
                  <button onClick={() => onOpenLeadDetail(selected.id)}
                    style={{ fontSize: 12, padding: '8px 14px', background: C.bg3, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}>
                    🔍 View Lead Detail
                  </button>
                )}
                <button onClick={() => updateLeadField('stage', 'Negotiating')}
                  style={{ fontSize: 12, padding: '8px 14px', background: C.bg3, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}>
                  💬 Update Deal
                </button>
                <button onClick={() => { updateLeadField('nextFollowUpAt', new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]) }}
                  style={{ fontSize: 12, padding: '8px 14px', background: C.bg3, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}>
                  📅 Set Follow-up (+2 days)
                </button>
                <button onClick={() => { updateLeadField('stage', 'Closed Won'); updateLeadField('probabilityToClose', 100) }}
                  style={{ fontSize: 12, padding: '8px 14px', background: 'rgba(34,197,94,0.12)', color: C.success, border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}>
                  ✅ Mark as Closed Won
                </button>
                <button onClick={() => { updateLeadField('stage', 'Closed Lost'); updateLeadField('probabilityToClose', 0) }}
                  style={{ fontSize: 12, padding: '8px 14px', background: C.dangerDim, color: C.danger, border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}>
                  ✕ Mark as Lost
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
