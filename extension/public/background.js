// WalletRoast Background Service Worker
// Proxies API calls from content scripts to the backend

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ROAST_TOKEN') {
        fetch('http://localhost:3001/api/roast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contractAddress: msg.contractAddress,
                fromAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
            })
        })
            .then(res => res.json())
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }))

        return true // Keep message channel open for async response
    }
})
