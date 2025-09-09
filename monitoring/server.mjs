import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 4000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint for hooks to post data to
app.post('/log', (req, res) => {
  const logData = req.body;
  console.log('Received log data:', logData);

  // Broadcast the data to all connected clients
  io.emit('log', logData);

  res.status(200).send({ message: 'Log received' });
});

io.on('connection', (socket) => {
  console.log('A user connected to the monitor');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Monitoring server running at http://localhost:${PORT}`);
});
