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

const systemPrompt = `You are a Crypto Crime Investigator generating a CRIMINAL RECORD report for a wallet.

Based on the wallet's token holdings and their security data, generate a criminal-style rap sheet.

Respond ONLY in this exact JSON format with no extra text:
{
  "alias": "a funny crypto nickname for this wallet based on behavior (e.g. 'The Degen Desperado', 'Paper Hands Pete', 'Diamond Chad')",
  "degenLevel": "CLEAN" or "SUSPECT" or "DEGEN" or "WANTED" or "MOST_WANTED",
  "degenScore": number from 0-100 (100 = maximum degen),
  "charges": ["array of funny criminal-style charges based on holdings, e.g. 'Possession of 3 unaudited shitcoins', 'Intent to ape without DYOR'"],
  "priors": ["array of past 'offenses' inferred from holdings, e.g. 'Known associate of honeypot tokens', 'Repeat offender: held multiple rug-pull candidates'"],
  "verdict": "one dramatic sentence summarizing the wallet's criminal status",
  "advice": "one piece of rehabilitation advice"
}

Rules for degenLevel:
- CLEAN: only holds trusted, verified tokens (USDC, USDT, WETH, etc)
- SUSPECT: mostly safe tokens but 1-2 questionable ones
- DEGEN: multiple risky tokens, some with high tax or hidden owners
- WANTED: holds known honeypots or scam tokens
- MOST_WANTED: majority of holdings are scams/honeypots

Be savage, funny, and dramatic. This is entertainment. Use crypto slang.`

router.post('/', async (req, res) => {
    try {
        const { walletAddress } = req.body

        if (!walletAddress) {
            return res.status(400).json({ error: 'walletAddress is required' })
        }

        // Step 1: Get all token balances for the wallet
        const balances = await alchemy.core.getTokenBalances(walletAddress)
        const nonZeroTokens = balances.tokenBalances
            .filter(t => t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000')
            .slice(0, 15) // Limit to 15 tokens to avoid rate limits

        // Step 2: Get token metadata for each
        const tokenDetails = []
        for (const token of nonZeroTokens) {
            try {
                const meta = await alchemy.core.getTokenMetadata(token.contractAddress)
                tokenDetails.push({
                    address: token.contractAddress,
                    name: meta.name || 'Unknown',
                    symbol: meta.symbol || '???',
                    balance: token.tokenBalance
                })
            } catch (e) {
                tokenDetails.push({
                    address: token.contractAddress,
                    name: 'Unknown',
                    symbol: '???',
                    balance: token.tokenBalance
                })
            }
        }

        // Step 3: Batch check security via GoPlus (up to 15 at once)
        const addresses = tokenDetails.map(t => t.address).join(',')
        let securityData = {}
        if (addresses) {
            try {
                const goplusRes = await axios.get(
                    `https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=${addresses}`
                )
                securityData = goplusRes.data.result || {}
            } catch (e) {
                // GoPlus may fail for some queries
            }
        }

        // Step 4: Build security profile for each token
        const tokenProfiles = tokenDetails.map(t => {
            const sec = securityData[t.address.toLowerCase()]
            return {
                name: sec?.token_name || t.name,
                symbol: sec?.token_symbol || t.symbol,
                address: t.address,
                isHoneypot: sec?.is_honeypot === '1',
                buyTax: sec?.buy_tax || '0',
                sellTax: sec?.sell_tax || '0',
                hiddenOwner: sec?.hidden_owner === '1',
                ownerCanMint: sec?.is_mintable === '1',
                isOpenSource: sec?.is_open_source === '1',
                isTrusted: sec?.trust_list === '1',
                transferPausable: sec?.transfer_pausable === '1',
            }
        })

        // Step 5: Calculate stats
        const stats = {
            totalTokens: tokenProfiles.length,
            honeypots: tokenProfiles.filter(t => t.isHoneypot).length,
            risky: tokenProfiles.filter(t =>
                t.hiddenOwner || t.ownerCanMint || !t.isOpenSource ||
                parseFloat(t.buyTax) > 5 || parseFloat(t.sellTax) > 5
            ).length,
            trusted: tokenProfiles.filter(t => t.isTrusted).length,
            closedSource: tokenProfiles.filter(t => !t.isOpenSource).length,
        }

        // Step 6: Ask Gemini to generate the criminal record
        const userPrompt = `Generate a criminal record for wallet: ${walletAddress}

Portfolio Stats:
- Total tokens held: ${stats.totalTokens}
- Honeypot tokens: ${stats.honeypots}
- Risky tokens: ${stats.risky}
- Trusted/verified tokens: ${stats.trusted}
- Closed source tokens: ${stats.closedSource}

Token Holdings:
${tokenProfiles.map(t =>
            `- ${t.name} (${t.symbol}): honeypot=${t.isHoneypot}, buyTax=${t.buyTax}%, sellTax=${t.sellTax}%, hiddenOwner=${t.hiddenOwner}, mintable=${t.ownerCanMint}, openSource=${t.isOpenSource}, trusted=${t.isTrusted}`
        ).join('\n')}

Generate the criminal record.`

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt
        })

        const result = await model.generateContent(userPrompt)
        const text = result.response.text()
        const cleaned = text.replace(/```json|```/g, '').trim()
        const record = JSON.parse(cleaned)

        res.json({
            ...record,
            walletAddress,
            stats,
            tokens: tokenProfiles
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Criminal record check failed', details: err.message })
    }
})

module.exports = router
