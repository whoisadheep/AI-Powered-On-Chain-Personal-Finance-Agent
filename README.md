# 🔥 WalletRoast — AI-Powered On-Chain Crypto Security Agent

> **Paste a contract. Face the judge.** An AI-powered Chrome Extension that protects crypto users from scam tokens by scanning, roasting, and explaining blockchain security risks in plain English.

![Built With](https://img.shields.io/badge/Built%20With-React%20%7C%20Node.js%20%7C%20Gemini%20AI-blue)
![Blockchain](https://img.shields.io/badge/Blockchain-Ethereum%20%7C%20Solidity-purple)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🧠 Problem Statement

In crypto, **scam tokens are everywhere** — honeypots (you can buy but never sell), hidden-owner rug pulls, tokens with secret mint functions, and crazy hidden taxes. Normal users can't read smart contract code, making them easy targets. **WalletRoast acts as your personal crypto security bodyguard.**

## ✨ Features

### 🔥 Token Roast (Core Feature)
Paste any token contract address → Backend queries **GoPlus Security API** for security facts, runs **Alchemy EVM Simulation** to detect hidden traps, and **Google Gemini AI** generates a verdict (**SAFE / RISKY / SCAM**) with a savage roast and a pro tip. Results include an animated **Risk Radar Chart** visualizing 5 risk dimensions.

### 🧠 Transaction Interpreter
Enter a destination address, ETH value, and optional calldata → The system **simulates the transaction** and **Gemini AI explains in plain English** what will actually happen, including warnings about taxes, honeypots, or suspicious asset flows.

### 🚔 Crypto Criminal Record
Enter any wallet address → Backend fetches **all token holdings** via Alchemy, batch-checks each token's security via GoPlus, and **Gemini AI generates a criminal-style rap sheet** — complete with a funny alias, degen level (CLEAN to MOST_WANTED), fake charges, and rehabilitation advice.

### 💬 AI Chat Follow-Up
After getting a roast, ask follow-up questions about the token. Powered by Gemini AI staying in character as the WalletRoast security expert.

### ⛓️ Soulbound Token (SBT) Minting
Mint your verdict **permanently on-chain** as a Soulbound Token via a Solidity smart contract. The SBT stores verdict, roast, degen score, and timestamp — your shame lives on the blockchain forever.

### 🛡️ Passive Auto-Detection (Content Script)
When browsing **Uniswap, Etherscan, or DEXTools**, the extension **automatically detects token addresses** from the URL and shows a **floating security banner** at the top of the page — no manual input needed. Works with SPAs via MutationObserver + pushState interception.

---

## 🏗️ Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│  Chrome Extension    │     │         Backend Server            │
│  (React + Vite)      │────▶│      (Node.js + Express)         │
│                      │     │                                  │
│  • Popup UI          │     │  /api/roast ──▶ GoPlus + Alchemy │
│  • Content Script    │     │                + Gemini AI       │
│  • Background Worker │     │  /api/interpret ──▶ Simulation   │
│                      │     │                    + Gemini AI   │
│  • SBT Minting       │     │  /api/criminal-record ──▶ Wallet │
│    (ethers.js)       │     │                    Scan + AI     │
│                      │     │  /api/chat ──▶ Gemini AI Chat   │
└─────────────────────┘     └──────────────────────────────────┘
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, Vite, HTML5 Canvas |
| **Backend** | Node.js, Express.js |
| **AI** | Google Gemini 2.5 Flash |
| **Blockchain Data** | Alchemy SDK (EVM simulation + token balances) |
| **Security Data** | GoPlus Security API |
| **Smart Contract** | Solidity (Soulbound Token / SBT) |
| **Wallet Integration** | MetaMask via ethers.js |
| **Extension** | Chrome Extension Manifest V3 |

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- Google Chrome
- MetaMask extension (for SBT minting)

### 1. Clone the repo

```bash
git clone https://github.com/whoisadheep/AI-Powered-On-Chain-Personal-Finance-Agent.git
cd AI-Powered-On-Chain-Personal-Finance-Agent
```

### 2. Setup the Backend

```bash
cd server
npm install
```

Create a `.env` file in the `server/` directory:

```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key
ALCHEMY_API_KEY=your_alchemy_api_key
```

Start the server:

```bash
node index.js
```

### 3. Setup the Extension

```bash
cd extension
npm install
npm run dev
```

### 4. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load Unpacked**
4. Select the `extension/dist` folder
5. Pin the WalletRoast extension

---

## 📸 How It Works

### Data Flow

```
User pastes token address (or auto-detected from DEX page)
       ↓
Chrome Extension ──▶ Backend Server
       ↓
GoPlus API (security facts) + Alchemy (EVM simulation)
       ↓
Google Gemini AI (generates verdict + roast)
       ↓
Result displayed: Risk Radar Chart + Verdict + Roast + Pro Tip
       ↓
(Optional) Mint as Soulbound Token on Ethereum
```

### Verdict Logic

| Verdict | Criteria |
|---------|---------|
| 🚨 **SCAM** | Honeypot detected, sell tax > 20%, or cannot sell all |
| ⚠️ **RISKY** | Hidden owner, mintable, pausable, closed source, or taxes 1-20% |
| ✅ **SAFE** | Trusted token, 0% taxes, open source, no red flags |

---

## 📁 Project Structure

```
├── server/
│   ├── index.js              # Express server entry point
│   ├── .env                  # API keys (not committed)
│   └── routes/
│       ├── roast.js          # Token security roast endpoint
│       ├── interpret.js      # Transaction interpreter endpoint
│       ├── criminal.js       # Wallet criminal record endpoint
│       ├── chat.js           # AI chat follow-up endpoint
│       └── simulate.js       # EVM simulation endpoint
│
├── extension/
│   ├── src/
│   │   ├── App.jsx           # Main React app (popup UI)
│   │   └── main.jsx          # React entry point
│   ├── public/
│   │   ├── manifest.json     # Chrome extension manifest (MV3)
│   │   ├── background.js     # Service worker for content script
│   │   ├── content.js        # Auto-detect + inject security banner
│   │   └── icon.png          # Extension icon
│   └── vite.config.js        # Vite build config
```

---

## 🔑 API Keys Required

| Service | Get Key From | Purpose |
|---------|-------------|---------|
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) | AI verdicts, roasts, interpretations |
| **Alchemy** | [alchemy.com](https://www.alchemy.com) | EVM simulation, token balances |
| **GoPlus** | Free, no key needed | Token security data |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License.

---

## 👤 Author

**Adheep** — [@whoisadheep](https://github.com/whoisadheep)

---

<p align="center">
  <b>⚠️ Crypto Security Tribunal • PASTE A CONTRACT. FACE THE JUDGE. 🔥</b>
</p>
