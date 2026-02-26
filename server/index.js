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

const interpretRoute = require('./routes/interpret')
app.use('/api/interpret', interpretRoute)

const chatRoute = require('./routes/chat')
app.use('/api/chat', chatRoute)

const criminalRoute = require('./routes/criminal')
app.use('/api/criminal-record', criminalRoute)

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});