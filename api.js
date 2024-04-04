// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const SCBEASY = require('./scbeasy');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Endpoint to handle SCBEASY actions
app.post('/', async (req, res) => {
    try {
        // Destructure request parameters
        const { action, deviceId, pin, web, bankType, start, end, accountTo, BankCode, amount, qrCode, mobileNo } = req.body;

        // Validate required parameters
        if (!action || !deviceId || !pin || !web || !bankType) {
            return res.status(400).json({ error: 'Incomplete parameters' });
        }

        // Create SCBEASY instance
        const scb = new SCBEASY(deviceId, pin, null, bankType, web);

        // Login to SCBEASY
        const login = await scb.login();
        if (!login) {
            return res.status(400).json({ error: 'Invalid login' });
        }

        // Invoke SCBEASY method based on action
        switch (action.toLowerCase()) {
            case 'getquickbalance':
                const quickBalanceResult = await scb.getQuickBalance();
                return res.send(quickBalanceResult);
            case 'transactions':
                const transactionsResult = await scb.Transactions(start, end, 1, null);
                return res.send(transactionsResult);
            case 'billscan':
                const billScanResult = await scb.BillScan(qrCode);
                return res.send(billScanResult);
            case 'getbankcode':
                const bankCodeResult = await scb.getBankCode();
                return res.send(bankCodeResult);
            case 'transfer':
                const TransferBypassLimit = await scb.TransferBypassLimit(accountTo, BankCode, amount);
                return res.send(TransferBypassLimit);
            case 'transferverification':
                const TransferVerification = await scb.TransferVerification(accountTo, BankCode, amount);
                return res.send(TransferVerification);
            case 'transferconfirmation':
                const TransferConfirmation = await scb.TransferConfirmation(accountTo, BankCode, amount);
                return res.send(TransferConfirmation);
            case 'getdashboard':
                const dashboardResult = await scb.getDashboard();
                return res.send(dashboardResult);
            case 'topuptruewallet':
                const topupResult = await scb.TopupTruewallet(mobileNo, amount);
                return res.send(topupResult);
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Error processing request:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
