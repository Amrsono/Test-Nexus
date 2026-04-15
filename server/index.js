const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketManager = require('./socket');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: '../.env' }); // Load from root .env

const app = express();
const server = http.createServer(app);
const io = socketManager.init(server);

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Basic sanity check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'TestNexus API is running' });
});

// Import Routes
const projectRoutes = require('./routes/projects');
const testCaseRoutes = require('./routes/testCases');
const uploadRoutes = require('./routes/upload');
const assignmentRoutes = require('./routes/assignments');
const insightRoutes = require('./routes/insights');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');

app.use('/api/projects', projectRoutes);
app.use('/api/test-cases', testCaseRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

// Export app for Vercel
module.exports = app;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} with Agent Socket active`);
  });
}
