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

const systemPrompt = `You are the Crypto RoastMaster. You are ruthless and sarcastic but technically accurate. 
You only roast based on the facts given to you. Never invent information.

Use these strict verdict rules in order:
- SCAM: if honeypot is true OR sell tax above 20% OR cannot sell all is true
- RISKY: if hidden owner true OR owner can mint true OR owner can change balance true OR buy/sell tax between 1-20% OR transfer pausable true OR NOT open source
- SAFE: only if trusted token OR (honeypot false AND taxes 0% AND open source true AND hidden owner false AND cannot mint false AND owner cannot change balance)

Always respond in this exact JSON format with no extra text:
{
  "verdict": "SCAM" or "RISKY" or "SAFE",
  "roast": "one savage sentence",
  "tip": "one actionable piece of advice"
}`

router.post('/', async (req, res) => {
    try {
        const { contractAddress, fromAddress } = req.body


        const goplusRes = await axios.get(
            `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${contractAddress}`
        )
        const data = goplusRes.data.result[contractAddress.toLowerCase()]

        if (!data) {
            return res.status(404).json({ error: 'Contract not found on GoPlus' })
        }

        const facts = {
            isHoneypot: data.is_honeypot === "1",
            buyTax: data.buy_tax || "0",
            sellTax: data.sell_tax || "0",
            ownerCanMint: data.is_mintable === "1",
            hiddenOwner: data.hidden_owner === "1",
            cannotSellAll: data.cannot_sell_all === "1",
            transferPausable: data.transfer_pausable === "1",
            isOpenSource: data.is_open_source === "1",
            isTrusted: data.trust_list === "1",
            ownerCanChangeBalance: data.owner_change_balance === "1"
        }

        const tokenName = data.token_name && data.token_symbol ? `${data.token_name} (${data.token_symbol})` : 'Unknown Token'

        console.log('GoPlus raw data:', JSON.stringify(data, null, 2))
        console.log('Facts:', facts)


        let simulationSummary = "No simulation data available."
        if (fromAddress) {
            try {
                const simulation = await alchemy.transact.simulateAssetChanges({
                    from: fromAddress,
                    to: contractAddress,
                    value: "0x0"
                })
                const changes = simulation.changes.map(c =>
                    `${c.changeType}: ${c.amount} ${c.symbol}`
                )
                simulationSummary = changes.length > 0
                    ? changes.join(', ')
                    : "No asset changes detected in simulation."
            } catch (e) {
                simulationSummary = "Simulation unavailable."
            }
        }


        const userPrompt = `Here are the facts about this token:
- Honeypot (can't sell): ${facts.isHoneypot}
- Buy Tax: ${facts.buyTax}%
- Sell Tax: ${facts.sellTax}%
- Can mint unlimited tokens: ${facts.ownerCanMint}
- Hidden owner (can rug): ${facts.hiddenOwner}
- Owner can change balances: ${facts.ownerCanChangeBalance}
- Can pause all transfers: ${facts.transferPausable}
- Cannot sell all tokens: ${facts.cannotSellAll}
- Open source contract: ${facts.isOpenSource}
- Trusted/verified token: ${facts.isTrusted}
- Simulation Result: ${simulationSummary}

Roast this token.`

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt
        })

        const result = await model.generateContent(userPrompt)
        const text = result.response.text()
        const cleaned = text.replace(/```json|```/g, '').trim()
        const roast = JSON.parse(cleaned)

        res.json({
            ...roast,
            tokenName,
            facts: {
                isHoneypot: facts.isHoneypot,
                buyTax: parseFloat(facts.buyTax),
                sellTax: parseFloat(facts.sellTax),
                ownerCanMint: facts.ownerCanMint,
                hiddenOwner: facts.hiddenOwner,
                transferPausable: facts.transferPausable,
                isOpenSource: facts.isOpenSource,
                ownerCanChangeBalance: facts.ownerCanChangeBalance,
                isTrusted: facts.isTrusted
            }
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Something went wrong', details: err.message })
    }
})

module.exports = router