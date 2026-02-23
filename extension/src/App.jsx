import { useState, useEffect } from 'react'
import axios from 'axios'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function FlowLine({ active, done }) {
  return (
    <div style={{
      width: '2px',
      height: '32px',
      margin: '0 auto',
      position: 'relative',
      overflow: 'hidden',
      background: done ? '#ff3c00' : '#1a1a1a',
      transition: 'background 0.4s'
    }}>
      {active && (
        <div style={{
          position: 'absolute',
          top: '-100%',
          width: '100%',
          height: '100%',
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
      background: '#080808',
      border: `1px solid ${borderColor}`,
      borderRadius: '6px',
      padding: '10px 14px',
      textAlign: 'center',
      transition: 'all 0.4s',
      boxShadow: status === 'done' ? '0 0 20px rgba(255,60,0,0.1)' : 'none'
    }}>
      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
        {status === 'done' ? '✓' : status === 'active' ? '⟳' : '○'}
      </div>
      <div style={{ fontSize: '10px', fontWeight: '700', color: textColor, letterSpacing: '1px' }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: '8px', color: '#333', marginTop: '2px', letterSpacing: '1px' }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [step, setStep] = useState(0)
  const [walletAddress, setWalletAddress] = useState(null)
  const [detectedFrom, setDetectedFrom] = useState(null)
  const [detecting, setDetecting] = useState(true)

  useEffect(() => {
    autoDetect()
  }, [])

  const autoDetect = async () => {
    setDetecting(true)


    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = tab?.url || ''

      const etherscanMatch = url.match(/etherscan\.io\/token\/(0x[a-fA-F0-9]{40})/i)
      const dextoolsMatch = url.match(/dextools\.io\/app\/.*\/(0x[a-fA-F0-9]{40})/i)
      const genericMatch = url.match(/(0x[a-fA-F0-9]{40})/)

      const detected = etherscanMatch?.[1] || dextoolsMatch?.[1] || genericMatch?.[1]

      if (detected) {
        setAddress(detected)
        setDetectedFrom('page')
      }
    } catch (e) { }


    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          if (!detectedFrom) setDetectedFrom('metamask')
        }
      }
    } catch (e) { }

    setDetecting(false)
  }

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('MetaMask not found. Please install MetaMask.')
        return
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts.length > 0) {
        setWalletAddress(accounts[0])
        setDetectedFrom('metamask')
      }
    } catch (e) {
      alert('Wallet connection failed: ' + e.message)
    }
  }

  const handleRoast = async () => {
    if (!address) return
    setLoading(true)
    setResult(null)
    setStep(0)

    try {
      await sleep(400)
      setStep(1)
      await sleep(800)
      setStep(2)
      await sleep(700)
      setStep(3)
      await sleep(900)
      setStep(4)

      const res = await axios.post('http://localhost:3001/api/roast', {
        contractAddress: address,
        fromAddress: walletAddress || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
      })

      await sleep(500)
      setStep(5)
      await sleep(400)
      setResult(res.data)

    } catch (err) {
      setStep(0)
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
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

  return (
    <>
      <style>{`
        @keyframes flowDown {
          0% { top: -100%; }
          100% { top: 100%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        minHeight: '600px',
        minWidth: '400px',
        background: '#0d0d0d',
        backgroundImage: `radial-gradient(ellipse at 20% 20%, rgba(255,60,0,0.04) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 80%, rgba(255,30,60,0.03) 0%, transparent 60%)`,
        fontFamily: "'Courier New', monospace",
        padding: '24px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}>


        <div style={{
          position: 'fixed', inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`,
          pointerEvents: 'none', zIndex: 0
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>


          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '4px', color: '#ff3c00', marginBottom: '6px' }}>
              ⚠ Crypto Security Tribunal
            </div>
            <h1 style={{ fontSize: '34px', fontWeight: '900', color: '#fff', letterSpacing: '-1px', lineHeight: 1, margin: 0 }}>
              WALLET<span style={{ color: '#ff3c00' }}>ROAST</span>
            </h1>
            <p style={{ color: '#444', fontSize: '11px', letterSpacing: '1px', margin: '6px 0 0 0' }}>
              PASTE A CONTRACT. FACE THE JUDGE.
            </p>
          </div>


          <div style={{ height: '1px', background: 'linear-gradient(90deg, #ff3c00, transparent)', marginBottom: '16px' }} />


          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#080808',
            border: '1px solid #1a1a1a',
            borderRadius: '4px',
            padding: '8px 12px',
            marginBottom: '12px',
            animation: 'fadeIn 0.4s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: walletAddress ? '#00ff88' : '#333',
                boxShadow: walletAddress ? '0 0 6px #00ff88' : 'none',
                transition: 'all 0.3s'
              }} />
              <span style={{ fontSize: '10px', color: walletAddress ? '#888' : '#333', letterSpacing: '1px' }}>
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                  : 'NO WALLET CONNECTED'}
              </span>
            </div>
            <button
              onClick={connectWallet}
              style={{
                background: 'transparent',
                border: `1px solid ${walletAddress ? '#222' : '#ff3c0066'}`,
                borderRadius: '3px',
                color: walletAddress ? '#333' : '#ff3c00',
                fontSize: '9px',
                letterSpacing: '1px',
                padding: '3px 8px',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {walletAddress ? 'CONNECTED ✓' : 'CONNECT'}
            </button>
          </div>


          {detectedFrom === 'page' && address && (
            <div style={{
              background: 'rgba(255,60,0,0.05)',
              border: '1px solid #ff3c0033',
              borderRadius: '4px',
              padding: '8px 12px',
              marginBottom: '12px',
              fontSize: '10px',
              color: '#ff3c00',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              animation: 'fadeIn 0.4s ease'
            }}>
              <span>🔍 Contract detected from page</span>
              <span style={{ color: '#444' }}>{address.slice(0, 6)}...{address.slice(-4)}</span>
            </div>
          )}


          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '10px', letterSpacing: '3px', color: '#555', display: 'block', marginBottom: '8px' }}>
              CONTRACT ADDRESS
            </label>
            <input
              type="text"
              placeholder="0x... (or auto-detected from page)"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRoast()}
              disabled={loading}
              style={{
                width: '100%',
                background: '#111',
                border: `1px solid ${detectedFrom === 'page' && address ? '#ff3c0044' : '#222'}`,
                borderRadius: '4px',
                padding: '12px 14px',
                color: '#fff',
                fontSize: '13px',
                fontFamily: "'Courier New', monospace",
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#ff3c00'}
              onBlur={e => e.target.style.borderColor = detectedFrom === 'page' ? '#ff3c0044' : '#222'}
            />
          </div>

          <button
            onClick={handleRoast}
            disabled={loading || !address}
            style={{
              width: '100%',
              padding: '13px',
              background: loading || !address ? '#1a1a1a' : '#ff3c00',
              border: 'none',
              borderRadius: '4px',
              color: loading || !address ? '#555' : '#fff',
              fontSize: '13px',
              fontWeight: '700',
              letterSpacing: '3px',
              cursor: loading || !address ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              boxSizing: 'border-box'
            }}
          >
            {loading ? '⟳ ANALYZING...' : 'RUN PRE-FLIGHT CHECK'}
          </button>


          {loading && (
            <div style={{ marginTop: '24px', animation: 'fadeIn 0.3s ease' }}>
              <div style={{ fontSize: '10px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '16px', textAlign: 'center' }}>
                ⟳ RUNNING SECURITY ANALYSIS
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', marginBottom: '16px' }}>


                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{
                    background: '#080808',
                    border: `1px solid ${step >= 1 ? '#ff3c0066' : '#1a1a1a'}`,
                    borderRadius: '6px',
                    padding: '8px',
                    textAlign: 'center',
                    transition: 'all 0.4s'
                  }}>
                    <div style={{ fontSize: '18px' }}>👛</div>
                    <div style={{ fontSize: '9px', color: step >= 1 ? '#888' : '#333', letterSpacing: '1px' }}>YOUR WALLET</div>
                    <div style={{ fontSize: '8px', color: '#222', marginTop: '2px' }}>
                      {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0xd8dA...6045'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', color: step >= 1 ? '#ff3c00' : '#1a1a1a', fontSize: '16px', transition: 'color 0.4s' }}>
                    ↓
                  </div>

                  <div style={{
                    background: '#080808',
                    border: `1px solid ${step >= 2 ? '#ff3c00' : '#1a1a1a'}`,
                    borderRadius: '6px',
                    padding: '8px',
                    textAlign: 'center',
                    transition: 'all 0.4s',
                    boxShadow: step >= 2 ? '0 0 16px rgba(255,60,0,0.1)' : 'none'
                  }}>
                    <div style={{ fontSize: '18px' }}>📄</div>
                    <div style={{ fontSize: '9px', color: step >= 2 ? '#fff' : '#333', letterSpacing: '1px' }}>CONTRACT</div>
                    <div style={{ fontSize: '8px', color: '#444', marginTop: '2px' }}>
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </div>
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


              <div style={{ fontSize: '10px', color: '#ff3c00', textAlign: 'center', letterSpacing: '2px', animation: 'pulse 1.2s ease infinite' }}>
                {step === 1 && '> QUERYING SECURITY DATABASE...'}
                {step === 2 && '> FORKING ETHEREUM MAINNET...'}
                {step === 3 && '> SIMULATING TRANSACTION ON EVM...'}
                {step === 4 && '> AI GENERATING VERDICT...'}
                {step === 5 && '> VERDICT READY'}
              </div>


              <div style={{ marginTop: '14px', height: '2px', background: '#111', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #ff3c00, #ff6600)',
                  width: `${(step / 5) * 100}%`,
                  transition: 'width 0.5s ease',
                  boxShadow: '0 0 10px #ff3c00'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ color: '#222', fontSize: '9px' }}>EVM SANDBOX</span>
                <span style={{ color: '#333', fontSize: '9px' }}>{Math.round((step / 5) * 100)}% complete</span>
              </div>
            </div>
          )}


          {result && vc && (
            <div style={{ marginTop: '20px', animation: 'fadeIn 0.5s ease' }}>

              <div style={{
                background: vc.bg,
                border: `1px solid ${vc.border}`,
                borderRadius: '4px',
                padding: '24px',
                textAlign: 'center',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '10px', letterSpacing: '4px', color: '#444', marginBottom: '8px' }}>
                  TRIBUNAL VERDICT
                </div>
                <div style={{
                  fontSize: '56px', fontWeight: '900', color: vc.color,
                  letterSpacing: '-2px', lineHeight: 1,
                  textShadow: `0 0 40px ${vc.color}66`
                }}>
                  {result.verdict}
                </div>
              </div>

              <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '18px', marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '10px' }}>THE ROAST</div>
                <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.6', margin: 0, fontStyle: 'italic' }}>
                  "{result.roast}"
                </p>
              </div>

              <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderLeft: '3px solid #ff3c00', borderRadius: '4px', padding: '18px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '3px', color: '#ff3c00', marginBottom: '10px' }}>PRO TIP</div>
                <p style={{ color: '#888', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>{result.tip}</p>
              </div>

              <button
                onClick={() => { setResult(null); setStep(0); setAddress(''); setDetectedFrom(null) }}
                style={{
                  width: '100%', marginTop: '12px', padding: '10px',
                  background: 'transparent', border: '1px solid #222',
                  borderRadius: '4px', color: '#444', fontSize: '11px',
                  letterSpacing: '2px', cursor: 'pointer', textTransform: 'uppercase',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={e => { e.target.style.borderColor = '#ff3c00'; e.target.style.color = '#ff3c00' }}
                onMouseLeave={e => { e.target.style.borderColor = '#222'; e.target.style.color = '#444' }}
              >
                ↺ ROAST ANOTHER
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}