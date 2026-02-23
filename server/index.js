const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const roastRoute = require('./routes/roast')
app.use('/api/roast', roastRoute)

const simulateRoute = require('./routes/simulate')
app.use('/api/simulate', simulateRoute)

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});