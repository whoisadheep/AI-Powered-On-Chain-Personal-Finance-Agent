const express = require('express');
const { Alchemy, Network } = require('alchemy-sdk');
require('dotenv').config();

const router = express.Router()

const alchemy = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.ETH_MAINNET
});

router.post('/', async (req, res) => {
    try {
        const { fromAddress, toAddress, value } = req.body

        const simulation = await alchemy.transact.simulateAssetChanges({
            from: fromAddress,
            to: toAddress,
            value: value || "0x0"
        })

        const changes = simulation.changes.map(change => ({
            asset: change.asset,
            symbol: change.symbol,
            amount: change.amount,
            direction: change.changeType
        }));

        const summary = {
            changes,
            userLost: changes.filter(c => c.direction === 'TRANSFER' && c.amount < 0),
            userGained: changes.filter(c => c.direction === 'TRANSFER' && c.amount > 0),
        }

        res.json(summary)

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Simulation failed', details: err.message })
    }
});

module.exports = router;