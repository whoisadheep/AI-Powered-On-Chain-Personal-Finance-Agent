import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { ethers } from 'ethers'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const CONTRACT_ADDRESS = "0xd9145CCE52D386f254917e481eB44e9943F39138"
const CONTRACT_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "wallet", "type": "address" },
      { "internalType": "string", "name": "verdict", "type": "string" },
      { "internalType": "string", "name": "roast", "type": "string" },
      { "internalType": "uint256", "name": "degenScore", "type": "uint256" }
    ],
    "name": "mintRoast",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "wallet", "type": "address" }],
    "name": "getRoast",
    "outputs": [
      {
        "components": [
          { "internalType": "string", "name": "verdict", "type": "string" },
          { "internalType": "string", "name": "roast", "type": "string" },
          { "internalType": "uint256", "name": "degenScore", "type": "uint256" },
          { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "internalType": "struct WalletRoast.RoastRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "hasSBT",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
]

function FlowLine({ active, done }) {
  return (
    <div style={{
      width: '2px', height: '32px', margin: '0 auto',
      position: 'relative', overflow: 'hidden',
      background: done ? '#ff3c00' : '#1a1a1a',
      transition: 'background 0.4s'
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: '-100%', width: '100%', height: '100%',
          background: 'linear-gradient(180deg, transparent, #ff3c00, transparent)',
          animation: 'flowDown 0.8s linear infinite'
        }} />
      )}
    </div>
  )
}

function FlowNode({ label, sublabel, status }) {
  const borderColor = status === 'done' ? '#ff3c00' : status === 'active' ? '#ff3c0066' : '#1a1a1a'
  const textColor = status === 'done' ? '#fff' : status === 'active' ? '#888' : '#333'
  return (
    <div style={{
      background: '#080808', border: `1px solid ${borderColor}`,
      borderRadius: '6px', padding: '10px 14px', textAlign: 'center',
      transition: 'all 0.4s',
      boxShadow: status === 'done' ? '0 0 20px rgba(255,60,0,0.1)' : 'none'
    }}>
      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
        {status === 'done' ? '✓' : status === 'active' ? '⟳' : '○'}
      </div>
      <div style={{ fontSize: '10px', fontWeight: '700', color: textColor, letterSpacing: '1px' }}>{label}</div>
      {sublabel && <div style={{ fontSize: '8px', color: '#333', marginTop: '2px', letterSpacing: '1px' }}>{sublabel}</div>}
    </div>
  )
}


function calculateRiskScore(facts) {
  if (!facts) return { total: 0, breakdown: [], radarAxes: [] }

  let honeypotScore = 0
  let taxScore = 0
  let ownershipScore = 0
  let transparencyScore = 0
  let trustScore = 0


  if (facts.isHoneypot) honeypotScore = 35
  else if (facts.transferPausable) honeypotScore = 20


  const maxTax = Math.max(facts.buyTax || 0, facts.sellTax || 0)
  if (maxTax >= 20) taxScore = 30
  else if (maxTax >= 10) taxScore = 20
  else if (maxTax >= 5) taxScore = 10
  else if (maxTax >= 1) taxScore = 5


  if (facts.hiddenOwner) ownershipScore += 15
  if (facts.ownerCanMint) ownershipScore += 15
  if (!facts.isOpenSource) ownershipScore += 5
  ownershipScore = Math.min(ownershipScore, 35)


  if (!facts.isOpenSource) transparencyScore += 40
  if (facts.hiddenOwner) transparencyScore += 30
  if (facts.ownerCanChangeBalance) transparencyScore += 30
  transparencyScore = Math.min(transparencyScore, 100)


  if (!facts.isTrusted) trustScore += 30
  if (facts.isHoneypot) trustScore += 40
  if (facts.ownerCanMint) trustScore += 15
  if (facts.transferPausable) trustScore += 15
  trustScore = Math.min(trustScore, 100)

  const total = honeypotScore + taxScore + ownershipScore

  return {
    total,
    breakdown: [
      { label: 'HONEYPOT RISK', score: honeypotScore, max: 35, color: '#ff2244' },
      { label: 'TAX RISK', score: taxScore, max: 30, color: '#ffaa00' },
      { label: 'OWNERSHIP RISK', score: ownershipScore, max: 35, color: '#ff6600' },
    ],
    radarAxes: [
      { label: 'HONEYPOT', value: (honeypotScore / 35) * 100, color: '#ff2244' },
      { label: 'TAX', value: (taxScore / 30) * 100, color: '#ffaa00' },
      { label: 'OWNERSHIP', value: (ownershipScore / 35) * 100, color: '#ff6600' },
      { label: 'OPACITY', value: transparencyScore, color: '#ff00aa' },
      { label: 'TRUST', value: trustScore, color: '#aa44ff' },
    ]
  }
}

function RiskRadarChart({ axes, verdictColor }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const progressRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const size = 220
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + 'px'
    canvas.style.height = size + 'px'
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const maxR = 80
    const n = axes.length
    const angleStep = (Math.PI * 2) / n
    const startAngle = -Math.PI / 2
    const progress = progressRef.current

    ctx.clearRect(0, 0, size, size)


    for (let ring = 1; ring <= 4; ring++) {
      const r = (maxR / 4) * ring
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const angle = startAngle + angleStep * i
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = ring === 4 ? '#333' : '#1a1a1a'
      ctx.lineWidth = 1
      ctx.stroke()
    }


    for (let i = 0; i < n; i++) {
      const angle = startAngle + angleStep * i
      const x = cx + Math.cos(angle) * maxR
      const y = cy + Math.sin(angle) * maxR

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 1
      ctx.stroke()


      const labelR = maxR + 16
      const lx = cx + Math.cos(angle) * labelR
      const ly = cy + Math.sin(angle) * labelR
      ctx.font = '8px Courier New'
      ctx.fillStyle = '#555'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(axes[i].label, lx, ly)
    }


    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const idx = i % n
      const angle = startAngle + angleStep * idx
      const val = (axes[idx].value / 100) * maxR * progress
      const x = cx + Math.cos(angle) * val
      const y = cy + Math.sin(angle) * val
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
    gradient.addColorStop(0, `${verdictColor}33`)
    gradient.addColorStop(1, `${verdictColor}08`)
    ctx.fillStyle = gradient
    ctx.fill()


    ctx.strokeStyle = verdictColor
    ctx.lineWidth = 2
    ctx.shadowColor = verdictColor
    ctx.shadowBlur = 12 + Math.sin(Date.now() / 500) * 4
    ctx.stroke()
    ctx.shadowBlur = 0

    for (let i = 0; i < n; i++) {
      const angle = startAngle + angleStep * i
      const val = (axes[i].value / 100) * maxR * progress
      const x = cx + Math.cos(angle) * val
      const y = cy + Math.sin(angle) * val

      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = axes[i].value > 0 ? axes[i].color : '#333'
      ctx.shadowColor = axes[i].color
      ctx.shadowBlur = axes[i].value > 0 ? 8 : 0
      ctx.fill()
      ctx.shadowBlur = 0


      if (axes[i].value > 0 && progress > 0.8) {
        const vlR = val + 12
        const vx = cx + Math.cos(angle) * vlR
        const vy = cy + Math.sin(angle) * vlR
        ctx.font = 'bold 9px Courier New'
        ctx.fillStyle = axes[i].color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(Math.round(axes[i].value), vx, vy)
      }
    }
  }, [axes, verdictColor])

  useEffect(() => {
    progressRef.current = 0
    const startTime = Date.now()
    const duration = 1200

    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)

      progressRef.current = 1 - Math.pow(1 - t, 3)
      draw()

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {

        const pulse = () => {
          draw()
          animRef.current = requestAnimationFrame(pulse)
        }
        pulse()
      }
    }
    animRef.current = requestAnimationFrame(animate)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [axes, draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', margin: '0 auto' }}
    />
  )
}

function RiskScoreBar({ label, score, max, color }) {
  const pct = Math.round((score / max) * 100)
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', letterSpacing: '2px', color: '#bbb' }}>{label}</span>
        <span style={{ fontSize: '11px', color: score > 0 ? color : '#aaa' }}>{score}/{max}</span>
      </div>
      <div style={{ height: '3px', background: '#111', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: '2px',
          boxShadow: score > 0 ? `0 0 6px ${color}88` : 'none',
          transition: 'width 0.8s ease'
        }} />
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('roast')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [step, setStep] = useState(0)
  const [walletAddress, setWalletAddress] = useState(null)
  const [detectedFrom, setDetectedFrom] = useState(null)
  const [minting, setMinting] = useState(false)
  const [minted, setMinted] = useState(false)

  const [interpTo, setInterpTo] = useState('')
  const [interpValue, setInterpValue] = useState('')
  const [interpData, setInterpData] = useState('')
  const [interpLoading, setInterpLoading] = useState(false)
  const [interpResult, setInterpResult] = useState(null)
  const [interpStep, setInterpStep] = useState(0)

  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const [crAddress, setCrAddress] = useState('')
  const [crLoading, setCrLoading] = useState(false)
  const [crResult, setCrResult] = useState(null)
  const [crStep, setCrStep] = useState(0)

  useEffect(() => { autoDetect() }, [])

  const autoDetect = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = tab?.url || ''
      const etherscanMatch = url.match(/etherscan\.io\/token\/(0x[a-fA-F0-9]{40})/i)
      const dextoolsMatch = url.match(/dextools\.io\/app\/.*\/(0x[a-fA-F0-9]{40})/i)
      const genericMatch = url.match(/(0x[a-fA-F0-9]{40})/)
      const detected = etherscanMatch?.[1] || dextoolsMatch?.[1] || genericMatch?.[1]
      if (detected) { setAddress(detected); setDetectedFrom('page') }
    } catch (e) { }

    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) setWalletAddress(accounts[0])
      }
    } catch (e) { }
  }

  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        if (accounts.length > 0) { setWalletAddress(accounts[0]); return }
      }
    } catch (e) { }

    const addr = prompt('Paste your wallet address (0x...):')
    if (addr && addr.startsWith('0x') && addr.length === 42) {
      setWalletAddress(addr)
    } else if (addr) {
      alert('Invalid address. Must be 0x... (42 characters)')
    }
  }

  const handleRoast = async () => {
    if (!address) return
    setLoading(true)
    setResult(null)
    setStep(0)
    setMinted(false)

    try {
      await sleep(400); setStep(1)
      await sleep(800); setStep(2)
      await sleep(700); setStep(3)
      await sleep(900); setStep(4)

      const res = await axios.post('http://localhost:3001/api/roast', {
        contractAddress: address,
        fromAddress: walletAddress || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
      })

      await sleep(500); setStep(5)
      await sleep(400)
      setResult(res.data)
    } catch (err) {
      setStep(0)
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInterpret = async () => {
    if (!interpTo) return
    setInterpLoading(true)
    setInterpResult(null)
    setInterpStep(0)

    try {
      await sleep(400); setInterpStep(1)
      await sleep(800); setInterpStep(2)
      await sleep(700); setInterpStep(3)

      const res = await axios.post('http://localhost:3001/api/interpret', {
        fromAddress: walletAddress || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        toAddress: interpTo,
        value: interpValue ? `0x${BigInt(Math.floor(parseFloat(interpValue) * 1e18)).toString(16)}` : '0x0',
        data: interpData || undefined
      })

      await sleep(500); setInterpStep(4)
      await sleep(400)
      setInterpResult(res.data)
    } catch (err) {
      setInterpStep(0)
      alert('Error: ' + err.message)
    } finally {
      setInterpLoading(false)
    }
  }

  const getInterpNodeStatus = (nodeStep) => {
    if (interpStep === 0) return 'idle'
    if (interpStep > nodeStep) return 'done'
    if (interpStep === nodeStep) return 'active'
    return 'idle'
  }

  const handleMint = async () => {
    try {
      setMinting(true)
      if (!window.ethereum) { alert('Please install MetaMask!'); return }
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      const degenScore = result.verdict === 'SAFE' ? 80 : result.verdict === 'RISKY' ? 40 : 10
      const tx = await contract.mintRoast(await signer.getAddress(), result.verdict, result.roast, degenScore)
      await tx.wait()
      setMinted(true)
    } catch (err) {
      alert('Minting failed: ' + err.message)
    } finally {
      setMinting(false)
    }
  }

  const getNodeStatus = (nodeStep) => {
    if (step === 0) return 'idle'
    if (step > nodeStep) return 'done'
    if (step === nodeStep) return 'active'
    return 'idle'
  }

  const verdictConfig = {
    SAFE: { color: '#00ff88', bg: 'rgba(0,255,136,0.05)', border: 'rgba(0,255,136,0.2)' },
    RISKY: { color: '#ffaa00', bg: 'rgba(255,170,0,0.05)', border: 'rgba(255,170,0,0.2)' },
    SCAM: { color: '#ff2244', bg: 'rgba(255,34,68,0.05)', border: 'rgba(255,34,68,0.2)' },
  }
  const vc = result ? verdictConfig[result.verdict] : null
  const riskScore = result ? calculateRiskScore(result.facts) : null

  return (
    <>
      <style>{`
        @keyframes flowDown { 0% { top: -100%; } 100% { top: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{
        minHeight: '600px', minWidth: '400px', background: '#0d0d0d',
        backgroundImage: `radial-gradient(ellipse at 20% 20%, rgba(255,60,0,0.04) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 80%, rgba(255,30,60,0.03) 0%, transparent 60%)`,
        fontFamily: "'Courier New', monospace", padding: '24px',
        boxSizing: 'border-box', position: 'relative', overflow: 'hidden'
      }}>

        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>


          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', letterSpacing: '4px', color: '#ff3c00', marginBottom: '6px' }}>⚠ Crypto Security Tribunal</div>
            <h1 style={{ fontSize: '40px', fontWeight: '900', color: '#fff', letterSpacing: '-1px', lineHeight: 1, margin: 0 }}>
              WALLET<span style={{ color: '#ff3c00' }}>ROAST</span>
            </h1>
            <p style={{ color: '#999', fontSize: '13px', letterSpacing: '1px', margin: '6px 0 0 0' }}>PASTE A CONTRACT. FACE THE JUDGE.</p>
          </div>

          <div style={{ height: '1px', background: 'linear-gradient(90deg, #ff3c00, transparent)', marginBottom: '16px' }} />


          <div style={{
            display: 'flex', gap: '0', marginBottom: '16px',
            background: '#080808', borderRadius: '6px', border: '1px solid #1a1a1a',
            overflow: 'hidden'
          }}>
            <button onClick={() => setActiveTab('roast')} style={{
              flex: 1, padding: '12px 0', background: activeTab === 'roast' ? '#ff3c00' : 'transparent',
              border: 'none', color: activeTab === 'roast' ? '#fff' : '#aaa',
              fontSize: '14px', fontWeight: '700', letterSpacing: '2px', cursor: 'pointer',
              fontFamily: "'Courier New', monospace", transition: 'all 0.3s',
              borderRight: '1px solid #1a1a1a'
            }}>ROAST</button>
            <button onClick={() => setActiveTab('interpret')} style={{
              flex: 1, padding: '12px 0', background: activeTab === 'interpret' ? '#00aaff' : 'transparent',
              border: 'none', color: activeTab === 'interpret' ? '#fff' : '#aaa',
              fontSize: '14px', fontWeight: '700', letterSpacing: '2px', cursor: 'pointer',
              fontFamily: "'Courier New', monospace", transition: 'all 0.3s',
              borderRight: '1px solid #1a1a1a'
            }}>INTERPRET</button>
            <button onClick={() => setActiveTab('record')} style={{
              flex: 1, padding: '12px 0', background: activeTab === 'record' ? '#ff2244' : 'transparent',
              border: 'none', color: activeTab === 'record' ? '#fff' : '#aaa',
              fontSize: '14px', fontWeight: '700', letterSpacing: '2px', cursor: 'pointer',
              fontFamily: "'Courier New', monospace", transition: 'all 0.3s'
            }}>🚔 RECORD</button>
          </div>

          {activeTab === 'roast' && (<>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px',
              padding: '8px 12px', marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: walletAddress ? '#00ff88' : '#333',
                  boxShadow: walletAddress ? '0 0 6px #00ff88' : 'none', transition: 'all 0.3s'
                }} />
                <span style={{ fontSize: '12px', color: walletAddress ? '#ccc' : '#666', letterSpacing: '1px' }}>
                  {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'NO WALLET CONNECTED'}
                </span>
              </div>
              <button onClick={connectWallet} style={{
                background: 'transparent',
                border: `1px solid ${walletAddress ? '#222' : '#ff3c0066'}`,
                borderRadius: '3px', color: walletAddress ? '#666' : '#ff3c00',
                fontSize: '11px', letterSpacing: '1px', padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase'
              }}>
                {walletAddress ? 'CONNECTED ✓' : 'CONNECT'}
              </button>
            </div>


            {detectedFrom === 'page' && address && (
              <div style={{
                background: 'rgba(255,60,0,0.05)', border: '1px solid #ff3c0033',
                borderRadius: '4px', padding: '10px 14px', marginBottom: '12px',
                fontSize: '13px', color: '#ff3c00',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                animation: 'fadeIn 0.4s ease'
              }}>
                <span>🔍 Contract detected from page</span>
                <span style={{ color: '#999' }}>{address.slice(0, 6)}...{address.slice(-4)}</span>
              </div>
            )}


            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', letterSpacing: '3px', color: '#bbb', display: 'block', marginBottom: '8px' }}>CONTRACT ADDRESS</label>
              <input
                type="text" placeholder="0x..." value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRoast()}
                disabled={loading}
                style={{
                  width: '100%', background: '#111',
                  border: `1px solid ${detectedFrom === 'page' && address ? '#ff3c0044' : '#222'}`,
                  borderRadius: '4px', padding: '14px 14px', color: '#fff',
                  fontSize: '15px', fontFamily: "'Courier New', monospace",
                  outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#ff3c00'}
                onBlur={e => e.target.style.borderColor = detectedFrom === 'page' ? '#ff3c0044' : '#222'}
              />
            </div>

            <button onClick={handleRoast} disabled={loading || !address} style={{
              width: '100%', padding: '13px',
              background: loading || !address ? '#1a1a1a' : '#ff3c00',
              border: 'none', borderRadius: '4px',
              color: loading || !address ? '#555' : '#fff',
              fontSize: '15px', fontWeight: '700', letterSpacing: '3px',
              cursor: loading || !address ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase', boxSizing: 'border-box'
            }}>
              {loading ? '⟳ ANALYZING...' : 'START'}
            </button>


            {loading && (
              <div style={{ marginTop: '24px', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '16px', textAlign: 'center' }}>
                  ⟳ RUNNING SECURITY ANALYSIS
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', marginBottom: '16px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{
                      background: '#080808', border: `1px solid ${step >= 1 ? '#ff3c0066' : '#1a1a1a'}`,
                      borderRadius: '6px', padding: '8px', textAlign: 'center', transition: 'all 0.4s'
                    }}>
                      <div style={{ fontSize: '18px' }}>👛</div>
                      <div style={{ fontSize: '9px', color: step >= 1 ? '#888' : '#333', letterSpacing: '1px' }}>YOUR WALLET</div>
                      <div style={{ fontSize: '8px', color: '#222', marginTop: '2px' }}>
                        {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0xd8dA...6045'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', color: step >= 1 ? '#ff3c00' : '#1a1a1a', fontSize: '16px', transition: 'color 0.4s' }}>↓</div>
                    <div style={{
                      background: '#080808', border: `1px solid ${step >= 2 ? '#ff3c00' : '#1a1a1a'}`,
                      borderRadius: '6px', padding: '8px', textAlign: 'center', transition: 'all 0.4s',
                      boxShadow: step >= 2 ? '0 0 16px rgba(255,60,0,0.1)' : 'none'
                    }}>
                      <div style={{ fontSize: '18px' }}>📄</div>
                      <div style={{ fontSize: '9px', color: step >= 2 ? '#fff' : '#333', letterSpacing: '1px' }}>CONTRACT</div>
                      <div style={{ fontSize: '8px', color: '#444', marginTop: '2px' }}>{address.slice(0, 6)}...{address.slice(-4)}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <FlowNode label="GOPLUS API" sublabel="SECURITY DB" status={getNodeStatus(1)} />
                    <FlowLine active={step === 2} done={step > 2} />
                    <FlowNode label="ALCHEMY" sublabel="MAINNET FORK" status={getNodeStatus(2)} />
                    <FlowLine active={step === 3} done={step > 3} />
                    <FlowNode label="EVM SANDBOX" sublabel="SIMULATION" status={getNodeStatus(3)} />
                    <FlowLine active={step === 4} done={step > 4} />
                    <FlowNode label="ROASTMASTER" sublabel="AI ANALYSIS" status={getNodeStatus(4)} />
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#ff3c00', textAlign: 'center', letterSpacing: '2px', animation: 'pulse 1.2s ease infinite' }}>
                  {step === 1 && '> QUERYING SECURITY DATABASE...'}
                  {step === 2 && '> FORKING ETHEREUM MAINNET...'}
                  {step === 3 && '> SIMULATING TRANSACTION ON EVM...'}
                  {step === 4 && '> AI GENERATING VERDICT...'}
                  {step === 5 && '> VERDICT READY'}
                </div>
                <div style={{ marginTop: '14px', height: '2px', background: '#111', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: 'linear-gradient(90deg, #ff3c00, #ff6600)',
                    width: `${(step / 5) * 100}%`, transition: 'width 0.5s ease', boxShadow: '0 0 10px #ff3c00'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ color: '#666', fontSize: '11px' }}>EVM SANDBOX</span>
                  <span style={{ color: '#999', fontSize: '11px' }}>{Math.round((step / 5) * 100)}% complete</span>
                </div>
              </div>
            )}


            {result && vc && (
              <div style={{ marginTop: '20px', animation: 'fadeIn 0.5s ease' }}>


                <div style={{
                  background: vc.bg, border: `1px solid ${vc.border}`,
                  borderRadius: '4px', padding: '20px', textAlign: 'center', marginBottom: '12px'
                }}>
                  <div style={{ fontSize: '13px', letterSpacing: '4px', color: '#aaa', marginBottom: '8px' }}>TRIBUNAL VERDICT</div>
                  {result.tokenName && (
                    <div style={{ fontSize: '14px', color: '#ccc', letterSpacing: '2px', marginBottom: '4px' }}>
                      {result.tokenName}
                    </div>
                  )}
                  <div style={{
                    fontSize: '52px', fontWeight: '900', color: vc.color,
                    letterSpacing: '-2px', lineHeight: 1, textShadow: `0 0 40px ${vc.color}66`
                  }}>
                    {result.verdict}
                  </div>
                  {riskScore && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '13px', color: '#aaa', letterSpacing: '2px', marginBottom: '4px' }}>
                        RISK SCORE
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: '900', color: vc.color }}>
                        {riskScore.total}<span style={{ fontSize: '16px', color: '#888' }}>/100</span>
                      </div>
                    </div>
                  )}
                </div>


                {riskScore && (
                  <div style={{
                    background: '#080808', border: '1px solid #1a1a1a',
                    borderRadius: '4px', padding: '16px', marginBottom: '12px'
                  }}>
                    <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '6px' }}>
                      📊 RISK RADAR
                    </div>
                    <RiskRadarChart axes={riskScore.radarAxes} verdictColor={vc.color} />
                    <div style={{ marginTop: '14px' }}>
                      {riskScore.breakdown.map((item, i) => (
                        <RiskScoreBar key={i} {...item} />
                      ))}
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {result.facts.isHoneypot && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,34,68,0.1)', border: '1px solid #ff224433', borderRadius: '20px', color: '#ff2244' }}>HONEYPOT</span>}
                      {result.facts.hiddenOwner && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,60,0,0.1)', border: '1px solid #ff3c0033', borderRadius: '20px', color: '#ff3c00' }}>HIDDEN OWNER</span>}
                      {result.facts.ownerCanMint && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,170,0,0.1)', border: '1px solid #ffaa0033', borderRadius: '20px', color: '#ffaa00' }}>MINTABLE</span>}
                      {result.facts.transferPausable && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,60,0,0.1)', border: '1px solid #ff3c0033', borderRadius: '20px', color: '#ff3c00' }}>PAUSABLE</span>}
                      {!result.facts.isOpenSource && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,170,0,0.1)', border: '1px solid #ffaa0033', borderRadius: '20px', color: '#ffaa00' }}>CLOSED SOURCE</span>}
                      {result.facts.buyTax > 0 && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,170,0,0.1)', border: '1px solid #ffaa0033', borderRadius: '20px', color: '#ffaa00' }}>BUY TAX {result.facts.buyTax}%</span>}
                      {result.facts.sellTax > 0 && <span style={{ fontSize: '11px', padding: '3px 10px', background: 'rgba(255,34,68,0.1)', border: '1px solid #ff224433', borderRadius: '20px', color: '#ff2244' }}>SELL TAX {result.facts.sellTax}%</span>}
                    </div>
                  </div>
                )}


                <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '18px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '10px' }}>THE ROAST</div>
                  <p style={{ color: '#eee', fontSize: '16px', lineHeight: '1.6', margin: 0, fontStyle: 'italic' }}>"{result.roast}"</p>
                </div>


                <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderLeft: '3px solid #ff3c00', borderRadius: '4px', padding: '18px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '10px' }}>💡 PRO TIP</div>
                  <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.6', margin: 0 }}>{result.tip}</p>
                </div>


                {!minted ? (
                  <button onClick={handleMint} disabled={minting} style={{
                    width: '100%', padding: '13px',
                    background: minting ? '#1a1a1a' : 'transparent',
                    border: '1px solid #7c3aed', borderRadius: '4px',
                    color: minting ? '#555' : '#7c3aed',
                    fontSize: '14px', fontWeight: '700', letterSpacing: '2px',
                    cursor: minting ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase', boxSizing: 'border-box',
                    transition: 'all 0.2s', marginBottom: '8px'
                  }}
                    onMouseEnter={e => { if (!minting) { e.target.style.background = '#7c3aed'; e.target.style.color = '#fff' } }}
                    onMouseLeave={e => { if (!minting) { e.target.style.background = 'transparent'; e.target.style.color = '#7c3aed' } }}
                  >
                    {minting ? '⟳ MINTING ON BLOCKCHAIN...' : '⛓️ MINT MY SHAME'}
                  </button>
                ) : (
                  <div style={{
                    padding: '13px', background: 'rgba(124,58,237,0.1)',
                    border: '1px solid #7c3aed', borderRadius: '4px',
                    textAlign: 'center', fontSize: '13px', color: '#7c3aed',
                    letterSpacing: '2px', marginBottom: '8px'
                  }}>
                    ⛓️ VERDICT MINTED ON BLOCKCHAIN FOREVER
                  </div>
                )}


                <button
                  onClick={() => { setResult(null); setStep(0); setAddress(''); setDetectedFrom(null); setMinted(false); setChatMessages([]); setChatOpen(false) }}
                  style={{
                    width: '100%', padding: '10px', background: 'transparent',
                    border: '1px solid #222', borderRadius: '4px', color: '#888',
                    fontSize: '13px', letterSpacing: '2px', cursor: 'pointer',
                    textTransform: 'uppercase', boxSizing: 'border-box'
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = '#ff3c00'; e.target.style.color = '#ff3c00' }}
                  onMouseLeave={e => { e.target.style.borderColor = '#222'; e.target.style.color = '#444' }}
                >
                  ↺ ROAST ANOTHER
                </button>

              </div>
            )}


            {result && (
              <div style={{ marginTop: '4px' }}>
                {!chatOpen ? (
                  <button
                    onClick={() => setChatOpen(true)}
                    style={{
                      width: '100%', padding: '12px',
                      background: 'linear-gradient(135deg, rgba(0,170,255,0.08), rgba(124,58,237,0.08))',
                      border: '1px solid rgba(0,170,255,0.25)',
                      borderRadius: '4px', color: '#00aaff',
                      fontSize: '12px', fontWeight: '700', letterSpacing: '2px',
                      cursor: 'pointer', fontFamily: "'Courier New', monospace",
                      textTransform: 'uppercase', boxSizing: 'border-box',
                      transition: 'all 0.3s', marginBottom: '8px'
                    }}
                    onMouseEnter={e => { e.target.style.background = 'rgba(0,170,255,0.15)'; e.target.style.borderColor = '#00aaff' }}
                    onMouseLeave={e => { e.target.style.background = 'linear-gradient(135deg, rgba(0,170,255,0.08), rgba(124,58,237,0.08))'; e.target.style.borderColor = 'rgba(0,170,255,0.25)' }}
                  >
                    🤖 ASK AI ABOUT THIS TOKEN
                  </button>
                ) : (
                  <div style={{
                    background: '#080808', border: '1px solid #1a1a1a',
                    borderRadius: '6px', overflow: 'hidden', marginBottom: '8px'
                  }}>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderBottom: '1px solid #1a1a1a',
                      background: 'linear-gradient(135deg, rgba(0,170,255,0.05), rgba(124,58,237,0.05))'
                    }}>
                      <span style={{ fontSize: '12px', letterSpacing: '3px', color: '#00aaff', fontWeight: '700' }}>🤖 AI CHAT</span>
                      <button onClick={() => setChatOpen(false)} style={{
                        background: 'transparent', border: '1px solid #222', borderRadius: '3px',
                        color: '#888', fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
                        fontFamily: "'Courier New', monospace"
                      }}>CLOSE</button>
                    </div>


                    <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '12px' }}>
                      {chatMessages.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                          <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>Ask me anything about {result.tokenName || 'this token'}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {[
                              'Is it safe to invest in this?',
                              'What does the risk score mean?',
                              'Explain the red flags',
                            ].map((q, i) => (
                              <button key={i} onClick={() => { setChatInput(q) }} style={{
                                background: '#111', border: '1px solid #222', borderRadius: '4px',
                                padding: '8px 12px', color: '#bbb', fontSize: '13px',
                                cursor: 'pointer', textAlign: 'left',
                                fontFamily: "'Courier New', monospace",
                                transition: 'all 0.2s'
                              }}
                                onMouseEnter={e => { e.target.style.borderColor = '#00aaff'; e.target.style.color = '#00aaff' }}
                                onMouseLeave={e => { e.target.style.borderColor = '#222'; e.target.style.color = '#888' }}
                              >→ {q}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <div key={i} style={{
                          marginBottom: '10px',
                          display: 'flex', flexDirection: 'column',
                          alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                        }}>
                          <div style={{
                            fontSize: '10px', letterSpacing: '2px',
                            color: msg.role === 'user' ? '#ff3c00' : '#00aaff',
                            marginBottom: '3px'
                          }}>{msg.role === 'user' ? 'YOU' : 'ROASTMASTER AI'}</div>
                          <div style={{
                            background: msg.role === 'user' ? 'rgba(255,60,0,0.08)' : 'rgba(0,170,255,0.08)',
                            border: `1px solid ${msg.role === 'user' ? '#ff3c0033' : '#00aaff33'}`,
                            borderRadius: msg.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                            padding: '10px 14px', maxWidth: '85%',
                            fontSize: '14px', color: '#eee', lineHeight: '1.5'
                          }}>{msg.content}</div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column' }}>
                          <div style={{ fontSize: '10px', letterSpacing: '2px', color: '#00aaff', marginBottom: '3px' }}>ROASTMASTER AI</div>
                          <div style={{
                            background: 'rgba(0,170,255,0.08)', border: '1px solid #00aaff33',
                            borderRadius: '8px 8px 8px 2px', padding: '10px 14px',
                            fontSize: '12px', color: '#00aaff', animation: 'pulse 1s ease infinite'
                          }}>⟳ thinking...</div>
                        </div>
                      )}
                    </div>


                    <div style={{ display: 'flex', gap: '6px', padding: '10px 12px', borderTop: '1px solid #1a1a1a' }}>
                      <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && chatInput.trim() && !chatLoading) {
                            const userMsg = { role: 'user', content: chatInput.trim() }
                            const newMsgs = [...chatMessages, userMsg]
                            setChatMessages(newMsgs)
                            setChatInput('')
                            setChatLoading(true)
                            axios.post('http://localhost:3001/api/chat', {
                              messages: newMsgs,
                              tokenContext: result
                            }).then(res => {
                              setChatMessages([...newMsgs, { role: 'assistant', content: res.data.reply }])
                            }).catch(() => {
                              setChatMessages([...newMsgs, { role: 'assistant', content: 'Oops, my roast circuits overloaded. Try again.' }])
                            }).finally(() => setChatLoading(false))
                          }
                        }}
                        placeholder="Ask about this token..."
                        disabled={chatLoading}
                        style={{
                          flex: 1, background: '#111', border: '1px solid #222',
                          borderRadius: '4px', padding: '8px 12px', color: '#fff',
                          fontSize: '12px', fontFamily: "'Courier New', monospace",
                          outline: 'none'
                        }}
                        onFocus={e => e.target.style.borderColor = '#00aaff'}
                        onBlur={e => e.target.style.borderColor = '#222'}
                      />
                      <button
                        onClick={() => {
                          if (!chatInput.trim() || chatLoading) return
                          const userMsg = { role: 'user', content: chatInput.trim() }
                          const newMsgs = [...chatMessages, userMsg]
                          setChatMessages(newMsgs)
                          setChatInput('')
                          setChatLoading(true)
                          axios.post('http://localhost:3001/api/chat', {
                            messages: newMsgs,
                            tokenContext: result
                          }).then(res => {
                            setChatMessages([...newMsgs, { role: 'assistant', content: res.data.reply }])
                          }).catch(() => {
                            setChatMessages([...newMsgs, { role: 'assistant', content: 'Oops, my roast circuits overloaded. Try again.' }])
                          }).finally(() => setChatLoading(false))
                        }}
                        disabled={chatLoading || !chatInput.trim()}
                        style={{
                          background: chatLoading || !chatInput.trim() ? '#1a1a1a' : '#00aaff',
                          border: 'none', borderRadius: '4px', color: '#fff',
                          padding: '8px 14px', fontSize: '12px', fontWeight: '700',
                          cursor: chatLoading ? 'not-allowed' : 'pointer',
                          fontFamily: "'Courier New', monospace"
                        }}
                      >↑</button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </>)}


          {activeTab === 'interpret' && (<>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px',
              padding: '8px 12px', marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: walletAddress ? '#00ff88' : '#333',
                  boxShadow: walletAddress ? '0 0 6px #00ff88' : 'none', transition: 'all 0.3s'
                }} />
                <span style={{ fontSize: '12px', color: walletAddress ? '#ccc' : '#666', letterSpacing: '1px' }}>
                  {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'NO WALLET CONNECTED'}
                </span>
              </div>
              <button onClick={connectWallet} style={{
                background: 'transparent',
                border: `1px solid ${walletAddress ? '#222' : '#00aaff66'}`,
                borderRadius: '3px', color: walletAddress ? '#666' : '#00aaff',
                fontSize: '11px', letterSpacing: '1px', padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase'
              }}>
                {walletAddress ? 'CONNECTED ✓' : 'CONNECT'}
              </button>
            </div>


            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', letterSpacing: '3px', color: '#bbb', display: 'block', marginBottom: '6px' }}>TO ADDRESS</label>
              <input
                type="text" placeholder="0x... (contract or wallet)" value={interpTo}
                onChange={e => setInterpTo(e.target.value)}
                disabled={interpLoading}
                style={{
                  width: '100%', background: '#111', border: '1px solid #222',
                  borderRadius: '4px', padding: '10px 14px', color: '#fff',
                  fontSize: '13px', fontFamily: "'Courier New', monospace",
                  outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#00aaff'}
                onBlur={e => e.target.style.borderColor = '#222'}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', letterSpacing: '3px', color: '#bbb', display: 'block', marginBottom: '6px' }}>ETH VALUE</label>
              <input
                type="text" placeholder="0.0 (optional)" value={interpValue}
                onChange={e => setInterpValue(e.target.value)}
                disabled={interpLoading}
                style={{
                  width: '100%', background: '#111', border: '1px solid #222',
                  borderRadius: '4px', padding: '10px 14px', color: '#fff',
                  fontSize: '13px', fontFamily: "'Courier New', monospace",
                  outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#00aaff'}
                onBlur={e => e.target.style.borderColor = '#222'}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', letterSpacing: '3px', color: '#bbb', display: 'block', marginBottom: '6px' }}>CALLDATA <span style={{ color: '#666' }}>(ADVANCED)</span></label>
              <textarea
                placeholder="0x... (optional — paste DEX swap data)" value={interpData}
                onChange={e => setInterpData(e.target.value)}
                disabled={interpLoading}
                rows={2}
                style={{
                  width: '100%', background: '#111', border: '1px solid #222',
                  borderRadius: '4px', padding: '10px 14px', color: '#fff',
                  fontSize: '13px', fontFamily: "'Courier New', monospace",
                  outline: 'none', boxSizing: 'border-box', resize: 'vertical'
                }}
                onFocus={e => e.target.style.borderColor = '#00aaff'}
                onBlur={e => e.target.style.borderColor = '#222'}
              />
            </div>

            <button onClick={handleInterpret} disabled={interpLoading || !interpTo} style={{
              width: '100%', padding: '13px',
              background: interpLoading || !interpTo ? '#1a1a1a' : '#00aaff',
              border: 'none', borderRadius: '4px',
              color: interpLoading || !interpTo ? '#555' : '#fff',
              fontSize: '15px', fontWeight: '700', letterSpacing: '3px',
              cursor: interpLoading || !interpTo ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase', boxSizing: 'border-box'
            }}>
              {interpLoading ? '⟳ INTERPRETING...' : 'INTERPRET'}
            </button>


            {interpLoading && (
              <div style={{ marginTop: '24px', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#00aaff', marginBottom: '16px', textAlign: 'center' }}>
                  ⟳ INTERPRETING TRANSACTION
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '240px', margin: '0 auto' }}>
                  <FlowNode label="ALCHEMY" sublabel="SIMULATION" status={getInterpNodeStatus(1)} />
                  <FlowLine active={interpStep === 1} done={interpStep > 1} />
                  <FlowNode label="GOPLUS" sublabel="SECURITY CHECK" status={getInterpNodeStatus(2)} />
                  <FlowLine active={interpStep === 2} done={interpStep > 2} />
                  <FlowNode label="GEMINI AI" sublabel="INTERPRETATION" status={getInterpNodeStatus(3)} />
                </div>
                <div style={{ fontSize: '13px', color: '#00aaff', textAlign: 'center', letterSpacing: '2px', marginTop: '14px', animation: 'pulse 1.2s ease infinite' }}>
                  {interpStep === 1 && '> SIMULATING TRANSACTION...'}
                  {interpStep === 2 && '> CHECKING CONTRACT SECURITY...'}
                  {interpStep === 3 && '> AI GENERATING EXPLANATION...'}
                  {interpStep === 4 && '> INTERPRETATION READY'}
                </div>
                <div style={{ marginTop: '14px', height: '2px', background: '#111', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: 'linear-gradient(90deg, #00aaff, #0066ff)',
                    width: `${(interpStep / 4) * 100}%`, transition: 'width 0.5s ease', boxShadow: '0 0 10px #00aaff'
                  }} />
                </div>
              </div>
            )}


            {interpResult && (() => {
              const riskConfig = {
                LOW: { color: '#00ff88', bg: 'rgba(0,255,136,0.05)', border: 'rgba(0,255,136,0.2)' },
                MEDIUM: { color: '#ffaa00', bg: 'rgba(255,170,0,0.05)', border: 'rgba(255,170,0,0.2)' },
                HIGH: { color: '#ff2244', bg: 'rgba(255,34,68,0.05)', border: 'rgba(255,34,68,0.2)' },
              }
              const rc = riskConfig[interpResult.riskLevel] || riskConfig.MEDIUM

              return (
                <div style={{ marginTop: '20px', animation: 'fadeIn 0.5s ease' }}>


                  <div style={{
                    background: rc.bg, border: `1px solid ${rc.border}`,
                    borderRadius: '4px', padding: '20px', textAlign: 'center', marginBottom: '12px'
                  }}>
                    <div style={{ fontSize: '13px', letterSpacing: '4px', color: '#aaa', marginBottom: '8px' }}>RISK ASSESSMENT</div>
                    <div style={{
                      fontSize: '42px', fontWeight: '900', color: rc.color,
                      letterSpacing: '-1px', lineHeight: 1, textShadow: `0 0 40px ${rc.color}66`
                    }}>
                      {rc.icon} {interpResult.riskLevel}
                    </div>
                  </div>


                  <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '18px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#00aaff', marginBottom: '10px' }}>AI INTERPRETATION</div>
                    <p style={{ color: '#eee', fontSize: '15px', lineHeight: '1.6', margin: 0 }}>{interpResult.summary}</p>
                  </div>

                  {interpResult.warnings && interpResult.warnings.length > 0 && (
                    <div style={{ background: 'rgba(255,34,68,0.05)', border: '1px solid rgba(255,34,68,0.15)', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff2244', marginBottom: '10px' }}>⚠️ WARNINGS</div>
                      {interpResult.warnings.map((w, i) => (
                        <div key={i} style={{
                          fontSize: '14px', color: '#ff8888', marginBottom: '6px',
                          paddingLeft: '12px', borderLeft: '2px solid #ff224466'
                        }}>• {w}</div>
                      ))}
                    </div>
                  )}


                  {interpResult.details && interpResult.details.length > 0 && (
                    <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#00aaff', marginBottom: '10px' }}>📋 TRANSACTION DETAILS</div>
                      {interpResult.details.map((d, i) => (
                        <div key={i} style={{
                          fontSize: '13px', color: '#bbb', marginBottom: '6px',
                          paddingLeft: '12px', borderLeft: '2px solid #00aaff33'
                        }}>→ {d}</div>
                      ))}
                    </div>
                  )}


                  {interpResult.simulation && interpResult.simulation.changes && interpResult.simulation.changes.length > 0 && (
                    <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#aaa', marginBottom: '10px' }}>📊 RAW ASSET CHANGES</div>
                      {interpResult.simulation.changes.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px' }}>
                          <span style={{ color: '#bbb' }}>{c.symbol || c.name || 'Unknown'}</span>
                          <span style={{ color: c.direction === 'TRANSFER' && parseFloat(c.amount) < 0 ? '#ff2244' : '#00ff88' }}>
                            {c.amount} {c.direction}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => { setInterpResult(null); setInterpStep(0); setInterpTo(''); setInterpValue(''); setInterpData('') }}
                    style={{
                      width: '100%', padding: '10px', background: 'transparent',
                      border: '1px solid #222', borderRadius: '4px', color: '#888',
                      fontSize: '13px', letterSpacing: '2px', cursor: 'pointer',
                      textTransform: 'uppercase', boxSizing: 'border-box'
                    }}
                    onMouseEnter={e => { e.target.style.borderColor = '#00aaff'; e.target.style.color = '#00aaff' }}
                    onMouseLeave={e => { e.target.style.borderColor = '#222'; e.target.style.color = '#444' }}
                  >
                    ↺ INTERPRET ANOTHER
                  </button>
                </div>
              )
            })()}

          </>)}


          {activeTab === 'record' && (<>


            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', letterSpacing: '3px', color: '#bbb', display: 'block', marginBottom: '6px' }}>SUSPECT WALLET ADDRESS</label>
              <input
                type="text" placeholder="0x... (any wallet to investigate)"
                value={crAddress}
                onChange={e => setCrAddress(e.target.value)}
                disabled={crLoading}
                style={{
                  width: '100%', background: '#111', border: '1px solid #222',
                  borderRadius: '4px', padding: '12px 14px', color: '#fff',
                  fontSize: '15px', fontFamily: "'Courier New', monospace",
                  outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#ff2244'}
                onBlur={e => e.target.style.borderColor = '#222'}
              />
              {walletAddress && crAddress !== walletAddress && (
                <button onClick={() => setCrAddress(walletAddress)} style={{
                  background: 'transparent', border: '1px solid #222', borderRadius: '3px',
                  color: '#888', fontSize: '11px', padding: '4px 10px', cursor: 'pointer',
                  marginTop: '6px', fontFamily: "'Courier New', monospace"
                }}
                  onMouseEnter={e => { e.target.style.color = '#ff2244'; e.target.style.borderColor = '#ff2244' }}
                  onMouseLeave={e => { e.target.style.color = '#444'; e.target.style.borderColor = '#222' }}
                >↳ USE MY WALLET ({walletAddress.slice(0, 6)}...{walletAddress.slice(-4)})</button>
              )}
            </div>

            <button onClick={async () => {
              const target = crAddress.trim()
              if (!target || !target.startsWith('0x') || target.length !== 42) {
                alert('Enter a valid wallet address (0x... 42 chars)'); return
              }
              setCrLoading(true)
              setCrResult(null)
              setCrStep(0)
              try {
                await sleep(400); setCrStep(1)
                await sleep(800); setCrStep(2)
                await sleep(700); setCrStep(3)
                const res = await axios.post('http://localhost:3001/api/criminal-record', {
                  walletAddress: target
                })
                await sleep(500); setCrStep(4)
                await sleep(400)
                setCrResult(res.data)
              } catch (err) {
                setCrStep(0)
                alert('Error: ' + err.message)
              } finally {
                setCrLoading(false)
              }
            }} disabled={crLoading || !crAddress.trim()} style={{
              width: '100%', padding: '13px',
              background: crLoading || !crAddress.trim() ? '#1a1a1a' : '#ff2244',
              border: 'none', borderRadius: '4px',
              color: crLoading || !crAddress.trim() ? '#555' : '#fff',
              fontSize: '15px', fontWeight: '700', letterSpacing: '3px',
              cursor: crLoading || !crAddress.trim() ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase', boxSizing: 'border-box'
            }}>
              {crLoading ? '⟳ INVESTIGATING...' : 'RUN BACKGROUND CHECK'}
            </button>


            {crLoading && (
              <div style={{ marginTop: '24px', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff2244', marginBottom: '16px', textAlign: 'center' }}>
                  INVESTIGATING WALLET
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '240px', margin: '0 auto' }}>
                  <FlowNode label="ALCHEMY" sublabel="TOKEN SCAN" status={crStep > 1 ? 'done' : crStep === 1 ? 'active' : 'idle'} />
                  <FlowLine active={crStep === 1} done={crStep > 1} />
                  <FlowNode label="GOPLUS" sublabel="SECURITY CHECK" status={crStep > 2 ? 'done' : crStep === 2 ? 'active' : 'idle'} />
                  <FlowLine active={crStep === 2} done={crStep > 2} />
                  <FlowNode label="GEMINI AI" sublabel="RAP SHEET" status={crStep > 3 ? 'done' : crStep === 3 ? 'active' : 'idle'} />
                </div>
                <div style={{ fontSize: '13px', color: '#ff2244', textAlign: 'center', letterSpacing: '2px', marginTop: '14px', animation: 'pulse 1.2s ease infinite' }}>
                  {crStep === 1 && '> SCANNING TOKEN HOLDINGS...'}
                  {crStep === 2 && '> RUNNING SECURITY CHECKS...'}
                  {crStep === 3 && '> AI GENERATING RAP SHEET...'}
                  {crStep === 4 && '> RECORD COMPLETE'}
                </div>
              </div>
            )}


            {crResult && (() => {
              try {
                const levelConfig = {
                  CLEAN: { color: '#00ff88', bg: 'rgba(0,255,136,0.05)', border: 'rgba(0,255,136,0.2)' },
                  SUSPECT: { color: '#ffaa00', bg: 'rgba(255,170,0,0.05)', border: 'rgba(255,170,0,0.2)' },
                  DEGEN: { color: '#ff6600', bg: 'rgba(255,102,0,0.05)', border: 'rgba(255,102,0,0.2)' },
                  WANTED: { color: '#ff2244', bg: 'rgba(255,34,68,0.05)', border: 'rgba(255,34,68,0.2)' },
                  MOST_WANTED: { color: '#ff0033', bg: 'rgba(255,0,51,0.08)', border: 'rgba(255,0,51,0.3)' },
                }
                const lc = levelConfig[crResult.degenLevel] || levelConfig.SUSPECT

                return (
                  <div style={{ marginTop: '20px', animation: 'fadeIn 0.5s ease' }}>


                    <div style={{
                      background: lc.bg, border: `1px solid ${lc.border}`,
                      borderRadius: '4px', padding: '20px', textAlign: 'center', marginBottom: '12px',
                      position: 'relative', overflow: 'hidden'
                    }}>
                      <div style={{ position: 'absolute', top: '8px', left: '12px', fontSize: '10px', letterSpacing: '3px', color: '#666' }}>CRYPTO POLICE DEPT.</div>
                      <div style={{ position: 'absolute', top: '8px', right: '12px', fontSize: '10px', letterSpacing: '2px', color: '#666' }}>CASE #{(crResult.walletAddress || crAddress).slice(-6).toUpperCase()}</div>
                      <div style={{ fontSize: '13px', letterSpacing: '4px', color: '#aaa', marginBottom: '4px', marginTop: '12px' }}>CRIMINAL RECORD</div>
                      <div style={{ fontSize: '22px', fontWeight: '900', color: lc.color, letterSpacing: '1px', marginBottom: '4px' }}>
                        "{crResult.alias}"
                      </div>
                      <div style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', marginBottom: '12px' }}>
                        {(crResult.walletAddress || crAddress).slice(0, 10)}...{(crResult.walletAddress || crAddress).slice(-8)}
                      </div>
                      <div style={{
                        display: 'inline-block', background: lc.color, color: '#000',
                        fontWeight: '900', fontSize: '16px', letterSpacing: '3px',
                        padding: '6px 20px', borderRadius: '4px'
                      }}>
                        {lc.emoji} {crResult.degenLevel}
                      </div>
                      <div style={{ marginTop: '10px', fontSize: '24px', fontWeight: '900', color: lc.color }}>
                        {crResult.degenScore}<span style={{ fontSize: '14px', color: '#888' }}>/100 DEGEN</span>
                      </div>
                    </div>


                    <div style={{
                      display: 'flex', gap: '6px', marginBottom: '12px'
                    }}>
                      {[
                        { label: 'TOKENS', value: crResult.stats?.totalTokens || 0, color: '#888' },
                        { label: 'HONEYPOTS', value: crResult.stats?.honeypots || 0, color: '#ff2244' },
                        { label: 'RISKY', value: crResult.stats?.risky || 0, color: '#ffaa00' },
                        { label: 'TRUSTED', value: crResult.stats?.trusted || 0, color: '#00ff88' },
                      ].map((s, i) => (
                        <div key={i} style={{
                          flex: 1, background: '#080808', border: '1px solid #1a1a1a',
                          borderRadius: '4px', padding: '8px 4px', textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '18px', fontWeight: '900', color: s.value > 0 ? s.color : '#555' }}>{s.value}</div>
                          <div style={{ fontSize: '9px', letterSpacing: '1px', color: '#888' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {crResult.charges && crResult.charges.length > 0 && (
                      <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderLeft: '3px solid #ff2244', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff2244', marginBottom: '10px' }}>⚖️ CHARGES</div>
                        {crResult.charges.map((c, i) => (
                          <div key={i} style={{ fontSize: '14px', color: '#eee', marginBottom: '6px', paddingLeft: '12px', borderLeft: '2px solid #ff224444' }}>
                            {i + 1}. {c}
                          </div>
                        ))}
                      </div>
                    )}


                    {crResult.priors && crResult.priors.length > 0 && (
                      <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderLeft: '3px solid #ffaa00', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ffaa00', marginBottom: '10px' }}>📄 PRIOR OFFENSES</div>
                        {crResult.priors.map((p, i) => (
                          <div key={i} style={{ fontSize: '14px', color: '#ccc', marginBottom: '6px', paddingLeft: '12px', borderLeft: '2px solid #ffaa0044' }}>
                            • {p}
                          </div>
                        ))}
                      </div>
                    )}


                    <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '18px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#ff2244', marginBottom: '10px' }}>🔨 JUDGE'S VERDICT</div>
                      <p style={{ color: '#eee', fontSize: '16px', lineHeight: '1.6', margin: 0, fontStyle: 'italic' }}>"{crResult.verdict}"</p>
                    </div>


                    <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderLeft: '3px solid #00aaff', borderRadius: '4px', padding: '18px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#00aaff', marginBottom: '10px' }}>💡 REHABILITATION ADVICE</div>
                      <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.6', margin: 0 }}>{crResult.advice}</p>
                    </div>


                    {crResult.tokens && crResult.tokens.length > 0 && (
                      <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', letterSpacing: '3px', color: '#aaa', marginBottom: '10px' }}>💼 EVIDENCE (TOKEN HOLDINGS)</div>
                        {crResult.tokens.map((t, i) => (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 0', borderBottom: i < crResult.tokens.length - 1 ? '1px solid #111' : 'none'
                          }}>
                            <div>
                              <span style={{ fontSize: '13px', color: t.isTrusted ? '#00ff88' : t.isHoneypot ? '#ff2244' : '#ccc' }}>{t.symbol}</span>
                              <span style={{ fontSize: '11px', color: '#666', marginLeft: '6px' }}>{t.name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {t.isHoneypot && <span style={{ fontSize: '8px', padding: '1px 6px', background: 'rgba(255,34,68,0.1)', border: '1px solid #ff224433', borderRadius: '10px', color: '#ff2244' }}>🍯</span>}
                              {t.hiddenOwner && <span style={{ fontSize: '8px', padding: '1px 6px', background: 'rgba(255,60,0,0.1)', border: '1px solid #ff3c0033', borderRadius: '10px', color: '#ff3c00' }}>👻</span>}
                              {t.isTrusted && <span style={{ fontSize: '8px', padding: '1px 6px', background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff8833', borderRadius: '10px', color: '#00ff88' }}>✓</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}


                    <button
                      onClick={() => { setCrResult(null); setCrStep(0) }}
                      style={{
                        width: '100%', padding: '10px', background: 'transparent',
                        border: '1px solid #222', borderRadius: '4px', color: '#888',
                        fontSize: '13px', letterSpacing: '2px', cursor: 'pointer',
                        textTransform: 'uppercase', boxSizing: 'border-box'
                      }}
                      onMouseEnter={e => { e.target.style.borderColor = '#ff2244'; e.target.style.color = '#ff2244' }}
                      onMouseLeave={e => { e.target.style.borderColor = '#222'; e.target.style.color = '#444' }}
                    >
                      ↺ CHECK ANOTHER WALLET
                    </button>
                  </div>
                )
              } catch (e) {
                return <div style={{ color: '#ff2244', fontSize: '12px', textAlign: 'center', padding: '20px' }}>Error rendering results. Try again.</div>
              }
            })()}

          </>)}

        </div>
      </div>
    </>
  )
}