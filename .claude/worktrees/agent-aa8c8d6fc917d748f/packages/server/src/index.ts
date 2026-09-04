import { createServer } from 'node:http';
import { config } from 'dotenv';
import { SocketServer } from './socket/SocketServer.js';

config(); // load .env

const PORT = Number(process.env['PORT'] ?? 3000);
const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] ?? '';

if (!ADMIN_TOKEN) {
  console.error('ADMIN_TOKEN not set in .env — admin features will be disabled');
}

const httpServer = createServer();
const socketServer = new SocketServer(httpServer, { adminToken: ADMIN_TOKEN });

httpServer.listen(PORT, () => {
  console.log(`Poke Fighter server running on http://localhost:${PORT}`);
});
