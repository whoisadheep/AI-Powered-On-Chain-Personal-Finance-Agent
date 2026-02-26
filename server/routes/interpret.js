const express = require('express')
const axios = require('axios')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { Alchemy, Network } = require('alchemy-sdk')
require('dotenv').config()

const router = express.Router()
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const alchemy = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.ETH_MAINNET
})

const systemPrompt = `You are a crypto transaction interpreter. Your job is to explain what a blockchain transaction will do in plain, simple English so even a beginner can understand it.

Given simulation results (asset changes) and optional security data about the destination contract, you must:
1. Explain what happens in one clear sentence
2. List any warnings or red flags
3. Break down every asset change

Respond ONLY in this exact JSON format with no extra text:
{
  "summary": "one clear sentence explaining the transaction",
  "riskLevel": "LOW" or "MEDIUM" or "HIGH",
  "warnings": ["array of warning strings, empty if none"],
  "details": ["array of human-readable asset change strings"]
}

Risk level rules:
- HIGH: if honeypot, sell tax > 20%, unlimited token approval, or net loss of significant value with no gain
- MEDIUM: if any tax between 1-20%, hidden owner, mintable, pausable, closed source, or unusual asset flows
- LOW: if no red flags and transaction looks straightforward

Be specific about token names, amounts, and directions of flow. If simulation shows no changes, say so clearly.
Never invent information. Only interpret what you are given.`

router.post('/', async (req, res) => {
    try {
        const { fromAddress, toAddress, value, data } = req.body

        if (!fromAddress || !toAddress) {
            return res.status(400).json({ error: 'fromAddress and toAddress are required' })
        }

        // Step 1: Simulate the transaction via Alchemy
        let simulationResult = null
        let simulationError = null
        try {
            const txParams = {
                from: fromAddress,
                to: toAddress,
                value: value || "0x0"
            }
            if (data) txParams.data = data

            simulationResult = await alchemy.transact.simulateAssetChanges(txParams)
        } catch (e) {
            simulationError = e.message
        }

        // Step 2: Get security info from GoPlus (treat toAddress as potential token contract)
        let securityFacts = null
        try {
            const goplusRes = await axios.get(
                `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${toAddress}`
            )
            const gpData = goplusRes.data.result[toAddress.toLowerCase()]
            if (gpData) {
                securityFacts = {
                    tokenName: gpData.token_name || 'Unknown',
                    tokenSymbol: gpData.token_symbol || '???',
                    isHoneypot: gpData.is_honeypot === "1",
                    buyTax: gpData.buy_tax || "0",
                    sellTax: gpData.sell_tax || "0",
                    ownerCanMint: gpData.is_mintable === "1",
                    hiddenOwner: gpData.hidden_owner === "1",
                    transferPausable: gpData.transfer_pausable === "1",
                    isOpenSource: gpData.is_open_source === "1",
                    isTrusted: gpData.trust_list === "1",
                    ownerCanChangeBalance: gpData.owner_change_balance === "1"
                }
            }
        } catch (e) {
            // GoPlus may not have data for every address — that's fine
        }

        // Step 3: Build prompt for Gemini
        let changesText = "Simulation failed or unavailable."
        if (simulationResult && simulationResult.changes) {
            if (simulationResult.changes.length === 0) {
                changesText = "No asset changes detected in simulation."
            } else {
                changesText = simulationResult.changes.map(c =>
                    `${c.changeType}: ${c.amount} ${c.symbol} (${c.name || 'Unknown Token'})`
                ).join('\n')
            }
        } else if (simulationError) {
            changesText = `Simulation error: ${simulationError}`
        }

        let securityText = "No security data available for destination address."
        if (securityFacts) {
            securityText = `Security data for ${securityFacts.tokenName} (${securityFacts.tokenSymbol}):
- Honeypot: ${securityFacts.isHoneypot}
- Buy Tax: ${securityFacts.buyTax}%
- Sell Tax: ${securityFacts.sellTax}%
- Owner can mint: ${securityFacts.ownerCanMint}
- Hidden owner: ${securityFacts.hiddenOwner}
- Transfer pausable: ${securityFacts.transferPausable}
- Open source: ${securityFacts.isOpenSource}
- Trusted token: ${securityFacts.isTrusted}
- Owner can change balances: ${securityFacts.ownerCanChangeBalance}`
        }

        const userPrompt = `Interpret this Ethereum transaction:
From: ${fromAddress}
To: ${toAddress}
Value: ${value || "0x0"}
${data ? `Calldata: ${data}` : 'No calldata (simple transfer)'}

Simulation Results:
${changesText}

${securityText}

Explain what this transaction does.`

        // Step 4: Ask Gemini to interpret
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt
        })

        const result = await model.generateContent(userPrompt)
        const text = result.response.text()
        const cleaned = text.replace(/```json|```/g, '').trim()
        const interpretation = JSON.parse(cleaned)

        res.json({
            ...interpretation,
            simulation: simulationResult ? {
                changes: simulationResult.changes.map(c => ({
                    asset: c.asset,
                    symbol: c.symbol,
                    name: c.name,
                    amount: c.amount,
                    direction: c.changeType
                }))
            } : null,
            security: securityFacts
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Interpretation failed', details: err.message })
    }
})

module.exports = router
