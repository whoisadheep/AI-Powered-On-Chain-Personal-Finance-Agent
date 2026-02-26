// WalletRoast Content Script
// Injects security banners onto DEX pages when risky tokens are detected

; (function () {
    'use strict'

    const BANNER_ID = 'walletroast-banner'
    const CHECK_INTERVAL = 2000
    let lastCheckedAddress = null
    let currentBanner = null

    // ─── Token Address Extraction ────────────────────────────────────────

    function extractTokenFromURL() {
        const url = window.location.href
        const hash = window.location.hash || ''
        const search = window.location.search || ''
        const fullQuery = hash.includes('?') ? hash.split('?')[1] : search.replace('?', '')
        const params = new URLSearchParams(fullQuery)

        // Uniswap: ?outputCurrency=0x... or ?inputCurrency=0x...
        const output = params.get('outputCurrency')
        const input = params.get('inputCurrency')
        if (output && output.startsWith('0x') && output.length === 42) return output
        if (input && input.startsWith('0x') && input.length === 42) return input

        // Etherscan: /token/0x...
        const etherscanMatch = url.match(/etherscan\.io\/token\/(0x[a-fA-F0-9]{40})/i)
        if (etherscanMatch) return etherscanMatch[1]

        // DEXtools: URL containing 0x address
        const dextoolsMatch = url.match(/dextools\.io\/.*\/(0x[a-fA-F0-9]{40})/i)
        if (dextoolsMatch) return dextoolsMatch[1]

        // Generic fallback: any 0x address in the URL path
        const genericMatch = url.match(/\/(0x[a-fA-F0-9]{40})/i)
        if (genericMatch) return genericMatch[1]

        return null
    }

    // ─── Banner UI (Shadow DOM) ──────────────────────────────────────────

    function createBanner(data) {
        removeBanner()

        const host = document.createElement('div')
        host.id = BANNER_ID
        host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:auto;'

        const shadow = host.attachShadow({ mode: 'closed' })

        const verdictColors = {
            SAFE: { bg: '#0a1f12', border: '#00ff88', text: '#00ff88', glow: 'rgba(0,255,136,0.3)' },
            RISKY: { bg: '#1f1a0a', border: '#ffaa00', text: '#ffaa00', glow: 'rgba(255,170,0,0.3)' },
            SCAM: { bg: '#1f0a0e', border: '#ff2244', text: '#ff2244', glow: 'rgba(255,34,68,0.4)' }
        }

        const vc = verdictColors[data.verdict] || verdictColors.RISKY

        // Calculate risk score
        let riskScore = 0
        if (data.facts) {
            if (data.facts.isHoneypot) riskScore += 35
            else if (data.facts.transferPausable) riskScore += 20
            const maxTax = Math.max(parseFloat(data.facts.buyTax) || 0, parseFloat(data.facts.sellTax) || 0)
            if (maxTax >= 20) riskScore += 30
            else if (maxTax >= 10) riskScore += 20
            else if (maxTax >= 5) riskScore += 10
            if (data.facts.hiddenOwner) riskScore += 15
            if (data.facts.ownerCanMint) riskScore += 15
            if (!data.facts.isOpenSource) riskScore += 5
        }

        const tokenName = data.tokenName || 'Unknown Token'
        const riskTags = []
        if (data.facts) {
            if (data.facts.isHoneypot) riskTags.push('HONEYPOT')
            if (data.facts.hiddenOwner) riskTags.push('HIDDEN OWNER')
            if (data.facts.ownerCanMint) riskTags.push('MINTABLE')
            if (data.facts.transferPausable) riskTags.push('PAUSABLE')
            if (parseFloat(data.facts.buyTax) > 0) riskTags.push(`BUY TAX ${data.facts.buyTax}%`)
            if (parseFloat(data.facts.sellTax) > 0) riskTags.push(`SELL TAX ${data.facts.sellTax}%`)
        }

        shadow.innerHTML = `
      <style>
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 4px 20px ${vc.glow}; }
          50% { box-shadow: 0 4px 40px ${vc.glow}, 0 0 60px ${vc.glow}; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .banner {
          font-family: 'Courier New', 'Consolas', monospace;
          background: ${vc.bg};
          border-bottom: 2px solid ${vc.border};
          padding: 12px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1), pulseGlow 3s ease infinite;
          position: relative;
          overflow: hidden;
        }
        .banner::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, ${vc.border}, transparent);
          background-size: 200% 100%;
          animation: shimmer 3s linear infinite;
        }
        .verdict-badge {
          background: ${vc.border};
          color: #000;
          font-weight: 900;
          font-size: 13px;
          letter-spacing: 2px;
          padding: 6px 14px;
          border-radius: 4px;
          white-space: nowrap;
          text-shadow: none;
        }
        .content {
          flex: 1;
          min-width: 0;
        }
        .token-name {
          font-size: 11px;
          color: ${vc.text};
          letter-spacing: 2px;
          margin-bottom: 3px;
          opacity: 0.8;
        }
        .roast {
          font-size: 13px;
          color: #ccc;
          line-height: 1.4;
          font-style: italic;
        }
        .tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .tag {
          font-size: 9px;
          padding: 2px 8px;
          border-radius: 20px;
          letter-spacing: 1px;
          border: 1px solid ${vc.border}44;
          color: ${vc.text};
          background: ${vc.border}15;
        }
        .right {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .score {
          font-size: 22px;
          font-weight: 900;
          color: ${vc.text};
          line-height: 1;
        }
        .score-label {
          font-size: 8px;
          color: #666;
          letter-spacing: 2px;
        }
        .dismiss {
          background: transparent;
          border: 1px solid #333;
          color: #666;
          font-size: 9px;
          padding: 3px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-family: inherit;
          letter-spacing: 1px;
          transition: all 0.2s;
        }
        .dismiss:hover {
          border-color: ${vc.border};
          color: ${vc.text};
        }
        .brand {
          position: absolute;
          bottom: 3px;
          right: 12px;
          font-size: 8px;
          color: #333;
          letter-spacing: 2px;
        }
      </style>
      <div class="banner">
        <div class="verdict-badge">${data.verdict === 'SCAM' ? '🚨' : data.verdict === 'RISKY' ? '⚠️' : '✅'} ${data.verdict}</div>
        <div class="content">
          <div class="token-name">${tokenName}</div>
          <div class="roast">"${data.roast}"</div>
          ${riskTags.length > 0 ? `
            <div class="tags">
              ${riskTags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="right">
          <div class="score">${riskScore}</div>
          <div class="score-label">RISK/100</div>
          <button class="dismiss" id="wr-dismiss">DISMISS</button>
        </div>
        <div class="brand">WALLETROAST</div>
      </div>
    `

        shadow.getElementById('wr-dismiss').addEventListener('click', () => {
            removeBanner()
            // Don't re-check this address until URL changes
            lastCheckedAddress = '__dismissed__'
        })

        document.documentElement.appendChild(host)
        currentBanner = host
    }

    function removeBanner() {
        if (currentBanner && currentBanner.parentNode) {
            currentBanner.parentNode.removeChild(currentBanner)
            currentBanner = null
        }
        const existing = document.getElementById(BANNER_ID)
        if (existing) existing.remove()
    }

    // ─── Loading Banner ──────────────────────────────────────────────────

    function showLoadingBanner(address) {
        removeBanner()

        const host = document.createElement('div')
        host.id = BANNER_ID
        host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:auto;'

        const shadow = host.attachShadow({ mode: 'closed' })
        shadow.innerHTML = `
      <style>
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 60%; }
          100% { width: 90%; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .banner {
          font-family: 'Courier New', monospace;
          background: #0d0d0d;
          border-bottom: 2px solid #ff3c00;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: slideDown 0.3s ease;
        }
        .spinner {
          font-size: 16px;
          animation: pulse 1s ease infinite;
        }
        .text {
          font-size: 11px;
          color: #ff3c00;
          letter-spacing: 2px;
          flex: 1;
        }
        .addr {
          font-size: 10px;
          color: #333;
        }
        .bar {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 2px;
          background: linear-gradient(90deg, #ff3c00, #ff6600);
          animation: progress 3s ease forwards;
          box-shadow: 0 0 10px #ff3c00;
        }
        .brand {
          font-size: 8px;
          color: #333;
          letter-spacing: 2px;
        }
      </style>
      <div class="banner" style="position:relative;">
        <div class="spinner">⟳</div>
        <div class="text">SCANNING TOKEN SECURITY...</div>
        <div class="addr">${address.slice(0, 6)}...${address.slice(-4)}</div>
        <div class="brand">WALLETROAST</div>
        <div class="bar"></div>
      </div>
    `
        document.documentElement.appendChild(host)
        currentBanner = host
    }

    // ─── Main Logic ──────────────────────────────────────────────────────

    function checkForToken() {
        const address = extractTokenFromURL()

        if (!address || address === lastCheckedAddress) return
        lastCheckedAddress = address

        showLoadingBanner(address)

        chrome.runtime.sendMessage(
            { type: 'ROAST_TOKEN', contractAddress: address },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('[WalletRoast] Background error:', chrome.runtime.lastError.message)
                    removeBanner()
                    return
                }

                if (response && response.success && response.data) {
                    createBanner(response.data)
                } else {
                    removeBanner()
                }
            }
        )
    }

    // ─── SPA Navigation Observer ─────────────────────────────────────────

    // Uniswap is a SPA - URL changes without page reload
    let lastUrl = window.location.href
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href
            lastCheckedAddress = null // Reset so we re-check
            setTimeout(checkForToken, 500) // Small delay for SPA to settle
        }
    })

    observer.observe(document.documentElement, { childList: true, subtree: true })

    // Also listen for pushState/replaceState
    const originalPushState = history.pushState
    history.pushState = function (...args) {
        originalPushState.apply(this, args)
        setTimeout(() => {
            lastCheckedAddress = null
            checkForToken()
        }, 500)
    }

    const originalReplaceState = history.replaceState
    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args)
        setTimeout(() => {
            lastCheckedAddress = null
            checkForToken()
        }, 500)
    }

    window.addEventListener('popstate', () => {
        lastCheckedAddress = null
        setTimeout(checkForToken, 500)
    })

    // hashchange for hash-based routing (Uniswap uses /#/swap)
    window.addEventListener('hashchange', () => {
        lastCheckedAddress = null
        setTimeout(checkForToken, 500)
    })

    // Initial check
    setTimeout(checkForToken, 1000)

    // Periodic check as fallback (some SPAs don't trigger DOM mutations on route change)
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href
            lastCheckedAddress = null
            checkForToken()
        }
    }, CHECK_INTERVAL)

})()
