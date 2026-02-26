const express = require('express')
const { GoogleGenerativeAI } = require('@google/generative-ai')
require('dotenv').config()

const router = express.Router()
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const systemPrompt = `You are the WalletRoast AI — a crypto security expert who is witty, sharp, and slightly sarcastic but genuinely helpful.

You have already analyzed a token and given a verdict. Now the user wants to ask follow-up questions about it. You have the token's security data as context.

Rules:
- Stay in character — concise, punchy, crypto-native language
- Answer based ONLY on the security facts provided. Never invent data.
- If asked about price predictions or financial advice, deflect with humor: "I roast tokens, not predict their price. DYOR."
- Keep responses SHORT — 2-3 sentences max unless the user asks for detail
- Use emojis sparingly but effectively
- If the user asks something unrelated to the token, redirect them back`

router.post('/', async (req, res) => {
    try {
        const { messages, tokenContext } = req.body

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages array is required' })
        }

        const contextBlock = tokenContext
            ? `\nToken being discussed: ${tokenContext.tokenName || 'Unknown'}
Verdict: ${tokenContext.verdict}
Roast: "${tokenContext.roast}"
Facts: Honeypot=${tokenContext.facts?.isHoneypot}, Buy Tax=${tokenContext.facts?.buyTax}%, Sell Tax=${tokenContext.facts?.sellTax}%, Hidden Owner=${tokenContext.facts?.hiddenOwner}, Mintable=${tokenContext.facts?.ownerCanMint}, Pausable=${tokenContext.facts?.transferPausable}, Open Source=${tokenContext.facts?.isOpenSource}, Trusted=${tokenContext.facts?.isTrusted}\n`
            : '\nNo token context available.\n'

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt + contextBlock
        })

        const chat = model.startChat({
            history: messages.slice(0, -1).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
        })

        const lastMessage = messages[messages.length - 1]
        const result = await chat.sendMessage(lastMessage.content)
        const text = result.response.text()

        res.json({ reply: text })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Chat failed', details: err.message })
    }
})

module.exports = router
