// Socket.IO server implementation
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients
const clients = {};
let connectionCount = 0;

// Handle socket events
io.on('connection', (socket) => {
  // Generate client ID and store connection
  const clientId = ++connectionCount;
  clients[clientId] = {
    id: clientId,
    socket: socket,
    ip: socket.handshake.address,
    connectedAt: new Date(),
    packetsSent: 0,
    packetsReceived: 0,
    bytesTransferred: 0
  };
  
  console.log(`Client ${clientId} connected from ${socket.handshake.address}`);
  
  // Broadcast new client info to all other clients
  socket.broadcast.emit('client-connected', {
    id: clientId,
    ip: socket.handshake.address,
    connectedAt: clients[clientId].connectedAt
  });
  
  // Send existing clients info to new client
  const existingClients = Object.keys(clients)
    .filter(id => id != clientId)
    .map(id => ({
      id: clients[id].id,
      ip: clients[id].ip,
      connectedAt: clients[id].connectedAt
    }));
  
  socket.emit('initialize', {
    yourId: clientId,
    existingClients: existingClients
  });
  
  // Demo packet transfer if there's more than one client
  if (Object.keys(clients).length > 1) {
    setTimeout(() => {
      // Find another client that isn't this one
      const otherClientIds = Object.keys(clients).filter(id => id != clientId);
      if (otherClientIds.length > 0) {
        const randomClientId = parseInt(otherClientIds[0]);
        
        // Demo TCP packet
        io.emit('packet-transferred', {
          from: clientId,
          to: randomClientId,
          protocol: 'tcp',
          size: 100,
          success: true
        });
        
        // Demo UDP packet after delay
        setTimeout(() => {
          io.emit('packet-transferred', {
            from: randomClientId,
            to: clientId,
            protocol: 'udp',
            size: 50,
            success: true
          });
        }, 1000);
      }
    }, 2000);
  }
  
  // Handle message sending
  socket.on('send-message', (data) => {
    const { targetId, message, protocol } = data;
    const timestamp = new Date();
    
    // Update statistics
    clients[clientId].packetsSent++;
    clients[clientId].bytesTransferred += message.length;
    
    console.log(`Client ${clientId} sending to ${targetId}: ${message}`);
    
    // For TCP simulation, we ensure delivery
    if (protocol === 'tcp') {
      // If target exists, deliver the message
      if (clients[targetId] && clients[targetId].socket) {
        // Simulate network delay
        setTimeout(() => {
          clients[targetId].socket.emit('receive-message', {
            from: clientId,
            message: message,
            timestamp: timestamp,
            protocol: 'tcp'
          });
          
          // Update receiver statistics
          clients[targetId].packetsReceived++;
          clients[targetId].bytesTransferred += message.length;
          
          // Send ACK back to sender
          socket.emit('message-ack', {
            targetId: targetId,
            timestamp: new Date(),
            originalTimestamp: timestamp
          });
          
          // Broadcast packet movement to all clients for visualization
          io.emit('packet-transferred', {
            from: clientId,
            to: targetId,
            protocol: 'tcp',
            size: message.length,
            success: true
          });
        }, 200 + Math.random() * 300); // Random delay between 200-500ms
      } else {
        // Target doesn't exist, send error back
        socket.emit('error', {
          message: `Client ${targetId} not found or disconnected`,
          timestamp: new Date()
        });
        
        // Also broadcast the failed packet transfer
        io.emit('packet-transferred', {
          from: clientId,
          to: targetId,
          protocol: 'tcp',
          size: message.length,
          success: false,
          error: 'Client not found'
        });
      }
    }
    // For UDP simulation, we might randomly drop packets
    else if (protocol === 'udp') {
      // Simulate ~10% packet loss
      const packetLost = Math.random() < 0.1;
      
      if (!packetLost && clients[targetId] && clients[targetId].socket) {
        // Deliver with variable delay (UDP is usually faster but unreliable)
        setTimeout(() => {
          clients[targetId].socket.emit('receive-message', {
            from: clientId,
            message: message,
            timestamp: timestamp,
            protocol: 'udp'
          });
          
          // Update receiver statistics
          clients[targetId].packetsReceived++;
          clients[targetId].bytesTransferred += message.length;
          
          // Note: No ACK for UDP
          
          // Broadcast packet movement for visualization
          io.emit('packet-transferred', {
            from: clientId,
            to: targetId,
            protocol: 'udp',
            size: message.length,
            success: true
          });
        }, 50 + Math.random() * 100); // UDP is faster: 50-150ms
      } else {
        // Packet lost or client not found
        io.emit('packet-transferred', {
          from: clientId,
          to: targetId,
          protocol: 'udp',
          size: message.length,
          success: false,
          error: packetLost ? 'Packet lost' : 'Client not found'
        });
      }
    }
  });
  
  // Handle client requesting stats
  socket.on('get-stats', () => {
    const clientStats = Object.keys(clients).map(id => ({
      id: clients[id].id,
      ip: clients[id].ip,
      connectedAt: clients[id].connectedAt,
      packetsSent: clients[id].packetsSent,
      packetsReceived: clients[id].packetsReceived,
      bytesTransferred: clients[id].bytesTransferred
    }));
    
    socket.emit('stats-update', clientStats);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client ${clientId} disconnected`);
    
    // Notify other clients
    io.emit('client-disconnected', clientId);
    
    // Remove from clients object
    delete clients[clientId];
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket visualization server running on port ${PORT}`);
  console.log(`Open multiple browser windows to http://localhost:${PORT} to test`);
});