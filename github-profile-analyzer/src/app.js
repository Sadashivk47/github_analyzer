const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const profileRoutes = require('./routes/profile.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api/profiles', profileRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

app.use(errorHandler);

module.exports = app;
