const WebSocket = require('ws');
let wss;
function initWebSocket(server) {
  wss = new WebSocket.Server({ server });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.send(JSON.stringify({ type: 'connected' }));
  });
}
function broadcast(channel, data) {
  if (!wss) return;
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  });
}
module.exports = { initWebSocket, broadcast };