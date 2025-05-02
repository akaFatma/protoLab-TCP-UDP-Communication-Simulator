// Initialize socket connection
const socket = io();

// Application state
let myClientId = null;
const connectedClients = {};
const messageLog = [];
const packetLog = [];
let selectedPacketId = null;

// DOM References
const clientIdElement = document.getElementById('client-id');
const connectionStatusElement = document.getElementById('connection-status');
const connectionEventsList = document.getElementById('connection-events');
const targetClientSelect = document.getElementById('target-client');
const protocolSelect = document.getElementById('protocol');
const messageInput = document.getElementById('message');
const sendButton = document.getElementById('send-button');
const messageContainer = document.getElementById('message-container');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');
const packetList = document.getElementById('packet-list');
const packetDetailsContent = document.getElementById('packet-details-content');
const statsBody = document.getElementById('stats-body');
const refreshStatsButton = document.getElementById('refresh-stats');
const networkSvg = d3.select('#network-svg');

// Tab System
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and panes
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Add active class to clicked button and corresponding pane
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        // Refresh visualizations when switching tabs
        if (tabId === 'network-diagram') {
            updateNetworkDiagram();
        } else if (tabId === 'statistics') {
            requestStats();
        }
    });
});

// Socket Event Handlers
socket.on('connect', () => {
    connectionStatusElement.textContent = 'Connected';
    connectionStatusElement.style.color = '#2ecc71';
    addConnectionEvent('Connected to server');
    
    // Simulate TCP handshake visualization
    simulateHandshake();
});

socket.on('disconnect', () => {
    connectionStatusElement.textContent = 'Disconnected';
    connectionStatusElement.style.color = '#e74c3c';
    addConnectionEvent('Disconnected from server');
});

socket.on('error', (data) => {
    addConnectionEvent(`Error: ${data.message}`);
    addMessageToLog({
        type: 'error',
        content: data.message,
        timestamp: new Date(data.timestamp)
    });
});

socket.on('initialize', (data) => {
    myClientId = data.yourId;
    clientIdElement.textContent = myClientId;
    addConnectionEvent(`Assigned client ID: ${myClientId}`);
    
    // Add existing clients to the dropdown
    data.existingClients.forEach(client => {
        addClientToList(client);
    });
    
    // Initialize network diagram
    updateNetworkDiagram();
    
    // Request initial stats
    requestStats();
});

socket.on('client-connected', (client) => {
    addConnectionEvent(`Client ${client.id} connected`);
    addClientToList(client);
    updateNetworkDiagram();
});

socket.on('client-disconnected', (clientId) => {
    addConnectionEvent(`Client ${clientId} disconnected`);
    removeClientFromList(clientId);
    updateNetworkDiagram();
});

socket.on('receive-message', (data) => {
    addConnectionEvent(`Received message from Client ${data.from} via ${data.protocol.toUpperCase()}`);
    
    addMessageToLog({
        type: 'received',
        fromId: data.from,
        content: data.message,
        protocol: data.protocol,
        timestamp: new Date(data.timestamp)
    });
    
    // Add to packet log
    addPacketToLog({
        id: generatePacketId(),
        type: 'data',
        protocol: data.protocol,
        from: data.from,
        to: myClientId,
        size: data.message.length,
        content: data.message,
        timestamp: new Date(data.timestamp)
    });
});

socket.on('message-ack', (data) => {
    addConnectionEvent(`Received ACK from Client ${data.targetId}`);
    
    // Add to packet log
    addPacketToLog({
        id: generatePacketId(),
        type: 'ack',
        protocol: 'tcp',
        from: data.targetId,
        to: myClientId,
        size: 0,
        content: 'ACK',
        timestamp: new Date(data.timestamp)
    });
});

socket.on('packet-transferred', (data) => {
    // Log packet transfer details
    console.log('Packet transferred event:', data);
    
    // Visualize packet movement on the network diagram for ALL packets
    // Including packets not directly involving this client
    animatePacket(data);
});

socket.on('stats-update', (stats) => {
    updateStatsTable(stats);
});

// UI Event Handlers
sendButton.addEventListener('click', () => {
    const targetId = targetClientSelect.value;
    const protocol = protocolSelect.value;
    const message = messageInput.value;
    
    if (!targetId) {
        alert('Please select a target client');
        return;
    }
    
    if (!message.trim()) {
        alert('Please enter a message');
        return;
    }
    
    // Send message to server
    socket.emit('send-message', {
        targetId: parseInt(targetId),
        message: message,
        protocol: protocol
    });
    
    // Add to message log
    addMessageToLog({
        type: 'sent',
        toId: parseInt(targetId),
        content: message,
        protocol: protocol,
        timestamp: new Date()
    });
    
    // Add to packet log
    addPacketToLog({
        id: generatePacketId(),
        type: 'data',
        protocol: protocol,
        from: myClientId,
        to: parseInt(targetId),
        size: message.length,
        content: message,
        timestamp: new Date()
    });
    
    // Manually trigger packet animation for the sent message
    animatePacket({
        from: myClientId,
        to: parseInt(targetId),
        protocol: protocol,
        size: message.length,
        success: true
    });
    
    // Clear message input
    messageInput.value = '';
});

refreshStatsButton.addEventListener('click', requestStats);

// When a packet is clicked in the packet list
packetList.addEventListener('click', (e) => {
    const packetItem = e.target.closest('.packet-item');
    if (!packetItem) return;
    
    // Remove selected class from all packets
    document.querySelectorAll('.packet-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selected class to clicked packet
    packetItem.classList.add('selected');
    
    // Get packet details
    const packetId = packetItem.getAttribute('data-id');
    selectedPacketId = packetId;
    showPacketDetails(packetId);
});

// Helper Functions
function addConnectionEvent(message) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="timestamp">[${formatTime(new Date())}]</span> ${message}`;
    connectionEventsList.appendChild(li);
    connectionEventsList.scrollTop = connectionEventsList.scrollHeight;
}

function addClientToList(client) {
    // Store client info
    connectedClients[client.id] = client;
    
    // Add to dropdown if not already there
    if (!document.querySelector(`#target-client option[value="${client.id}"]`)) {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `Client ${client.id}`;
        targetClientSelect.appendChild(option);
    }
}

function removeClientFromList(clientId) {
    // Remove from state
    delete connectedClients[clientId];
    
    // Remove from dropdown
    const option = document.querySelector(`#target-client option[value="${clientId}"]`);
    if (option) {
        option.remove();
    }
}

function addMessageToLog(message) {
    // Add to state
    messageLog.push(message);
    
    // Add to UI
    const messageItem = document.createElement('div');
    messageItem.classList.add('message-item');
    
    // Add appropriate class based on message type
    if (message.type === 'sent') {
        messageItem.classList.add('message-sent');
        messageItem.innerHTML = `
            <div class="message-meta">
                <span>To Client ${message.toId} via ${message.protocol.toUpperCase()} at ${formatTime(message.timestamp)}</span>
            </div>
            <div class="message-content">${message.content}</div>
        `;
    } else if (message.type === 'received') {
        messageItem.classList.add('message-received');
        messageItem.innerHTML = `
            <div class="message-meta">
                <span>From Client ${message.fromId} via ${message.protocol.toUpperCase()} at ${formatTime(message.timestamp)}</span>
            </div>
            <div class="message-content">${message.content}</div>
        `;
    } else if (message.type === 'error') {
        messageItem.classList.add('message-error');
        messageItem.innerHTML = `
            <div class="message-meta">
                <span>Error at ${formatTime(message.timestamp)}</span>
            </div>
            <div class="message-content">${message.content}</div>
        `;
    }
    
    messageContainer.appendChild(messageItem);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

function addPacketToLog(packet) {
    // Add to state
    packetLog.unshift(packet); // Add to beginning of array
    
    // Keep only the most recent 100 packets
    if (packetLog.length > 100) {
        packetLog.pop();
    }
    
    // Update packet list UI
    updatePacketList();
}

function updatePacketList() {
    packetList.innerHTML = '';
    
    packetLog.forEach(packet => {
        const packetItem = document.createElement('div');
        packetItem.classList.add('packet-item');
        packetItem.setAttribute('data-id', packet.id);
        
        let protocolDisplay = packet.protocol.toUpperCase();
        let typeDisplay = packet.type === 'data' ? 'DATA' : 'ACK';
        let directionDisplay = packet.from === myClientId ? 'OUT' : 'IN';
        
        packetItem.innerHTML = `
            <span class="${packet.protocol}-color">${protocolDisplay}</span>
            <span>${typeDisplay}</span>
            <span>${directionDisplay}</span>
            <span>From: ${packet.from}</span>
            <span>To: ${packet.to}</span>
            <span>${formatTime(packet.timestamp)}</span>
        `;
        
        if (packet.id === selectedPacketId) {
            packetItem.classList.add('selected');
        }
        
        packetList.appendChild(packetItem);
    });
}

function showPacketDetails(packetId) {
    const packet = packetLog.find(p => p.id === packetId);
    if (!packet) return;
    
    // Create detailed packet view with simulated header information
    const sourcePort = generateRandomPort(packet.from);
    const destPort = generateRandomPort(packet.to);
    const seqNumber = generateSequenceNumber(packet);
    const checksum = generateChecksum();
    
    let detailsHtml = `
        <div class="packet-header">
            <h4>${packet.protocol.toUpperCase()} Packet Details</h4>
            <p>Packet ID: ${packet.id}</p>
            <p>Timestamp: ${packet.timestamp.toISOString()}</p>
        </div>
        
        <div class="packet-section">
            <h4>Header</h4>
            <table>
                <tr>
                    <td>Source IP:</td>
                    <td>192.168.1.${packet.from}</td>
                </tr>
                <tr>
                    <td>Destination IP:</td>
                    <td>192.168.1.${packet.to}</td>
                </tr>
                <tr>
                    <td>Source Port:</td>
                    <td>${sourcePort}</td>
                </tr>
                <tr>
                    <td>Destination Port:</td>
                    <td>${destPort}</td>
                </tr>
    `;
    
    // Protocol-specific header fields
    if (packet.protocol === 'tcp') {
        detailsHtml += `
                <tr>
                    <td>Sequence Number:</td>
                    <td>${seqNumber}</td>
                </tr>
                <tr>
                    <td>Acknowledgment Number:</td>
                    <td>${packet.type === 'ack' ? seqNumber + 1 : 'N/A'}</td>
                </tr>
                <tr>
                    <td>Flags:</td>
                    <td>${packet.type === 'ack' ? 'ACK' : 'PSH, ACK'}</td>
                </tr>
                <tr>
                    <td>Window Size:</td>
                    <td>64240</td>
                </tr>
        `;
    } else if (packet.protocol === 'udp') {
        detailsHtml += `
                <tr>
                    <td>Length:</td>
                    <td>${8 + packet.size}</td>
                </tr>
        `;
    }
    
    detailsHtml += `
                <tr>
                    <td>Checksum:</td>
                    <td>${checksum}</td>
                </tr>
            </table>
        </div>
        
        <div class="packet-section">
            <h4>Payload</h4>
            <div class="packet-payload">${packet.content}</div>
        </div>
        
        <div class="packet-section">
            <h4>Metadata</h4>
            <table>
                <tr>
                    <td>Packet Type:</td>
                    <td>${packet.type.toUpperCase()}</td>
                </tr>
                <tr>
                    <td>Protocol:</td>
                    <td>${packet.protocol.toUpperCase()}</td>
                </tr>
                <tr>
                    <td>Payload Size:</td>
                    <td>${packet.size} bytes</td>
                </tr>
            </table>
        </div>
    `;
    
    packetDetailsContent.innerHTML = detailsHtml;
}

function requestStats() {
    socket.emit('get-stats');
}

function updateStatsTable(stats) {
    statsBody.innerHTML = '';
    
    stats.forEach(client => {
        const row = document.createElement('tr');
        
        const connectedAtDate = new Date(client.connectedAt);
        
        row.innerHTML = `
            <td>${client.id}</td>
            <td>${client.ip}</td>
            <td>${connectedAtDate.toLocaleString()}</td>
            <td>${client.packetsSent}</td>
            <td>${client.packetsReceived}</td>
            <td>${client.bytesTransferred} bytes</td>
        `;
        
        // Highlight current client
        if (client.id === myClientId) {
            row.style.fontWeight = 'bold';
            row.style.backgroundColor = '#e3f2fd';
        }
        
        statsBody.appendChild(row);
    });
}

function updateNetworkDiagram() {
    const svg = networkSvg;
    const width = parseInt(svg.style('width') || svg.attr('width'), 10) || 800;
    const height = parseInt(svg.style('height') || svg.attr('height'), 10) || 500;
    
    // Clear previous visualization
    svg.selectAll('*').remove();
    
    // Get all clients including this client
    const allClients = { ...connectedClients };
    if (myClientId !== null) {
        allClients[myClientId] = { id: myClientId };
    }
    
    const clientIds = Object.keys(allClients).map(id => parseInt(id));
    if (clientIds.length === 0) return;
    
    // Create positions for clients in a circle
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;
    
    const clientPositions = {};
    
    clientIds.forEach((id, index) => {
        const angle = (2 * Math.PI * index) / clientIds.length;
        clientPositions[id] = {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        };
    });
    
    // Draw connections
    clientIds.forEach(fromId => {
        clientIds.forEach(toId => {
            if (fromId !== toId) {
                svg.append('line')
                    .attr('x1', clientPositions[fromId].x)
                    .attr('y1', clientPositions[fromId].y)
                    .attr('x2', clientPositions[toId].x)
                    .attr('y2', clientPositions[toId].y)
                    .attr('stroke', '#ddd')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '3,3');
            }
        });
    });
    
    // Draw client nodes
    clientIds.forEach(id => {
        const group = svg.append('g')
            .attr('class', 'client-node')
            .attr('transform', `translate(${clientPositions[id].x}, ${clientPositions[id].y})`);
        
        // Node circle
        group.append('circle')
            .attr('r', 25)
            .attr('fill', id === myClientId ? '#3498db' : '#95a5a6')
            .attr('stroke', id === myClientId ? '#2980b9' : '#7f8c8d')
            .attr('stroke-width', 2);
        
        // Client ID label
        group.append('text')
            .attr('class', 'client-label')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.3em')
            .attr('fill', 'white')
            .text(id);
    });
    
    // Store positions for packet animations
    window.clientPositions = clientPositions;
    
    // Create sample packet animations to demonstrate functionality
    if (clientIds.length > 1 && myClientId !== null) {
        setTimeout(() => {
            // Find another client that isn't us
            const otherClient = clientIds.find(id => id !== myClientId);
            if (otherClient) {
                // Show a TCP packet
                animatePacket({
                    from: myClientId,
                    to: otherClient,
                    protocol: 'tcp',
                    size: 100,
                    success: true
                });
                
                // After a delay, show UDP packet
                setTimeout(() => {
                    animatePacket({
                        from: otherClient,
                        to: myClientId,
                        protocol: 'udp',
                        size: 50,
                        success: true
                    });
                    
                    // Then show a failed packet
                    setTimeout(() => {
                        animatePacket({
                            from: myClientId,
                            to: otherClient,
                            protocol: 'udp',
                            size: 75,
                            success: false
                        });
                    }, 1500);
                }, 1200);
            }
        }, 500);
    }
}

function animatePacket(data) {
    if (!window.clientPositions) {
        console.log("No client positions available for animation");
        updateNetworkDiagram(); // Try to initialize the positions
        return;
    }
    
    const positions = window.clientPositions;
    const fromPos = positions[data.from];
    const toPos = positions[data.to];
    
    if (!fromPos || !toPos) {
        console.log(`Missing position data for clients: from=${data.from}, to=${data.to}`);
        console.log("Available positions:", Object.keys(positions));
        return;
    }
    
    console.log(`Animating packet: ${data.protocol} from ${data.from} to ${data.to}`);
    
    const svg = networkSvg;
    
    // Determine packet color based on protocol and success
    let packetColor = '#3498db'; // Default blue for TCP
    if (data.protocol === 'udp') {
        packetColor = '#2ecc71'; // Green for UDP
    } else if (data.type === 'ack') {
        packetColor = '#f1c40f'; // Yellow for ACK
    }
    
    if (!data.success) {
        packetColor = '#e74c3c'; // Red for errors
    }
    
    // Create the packet with larger size to be more visible
    const packet = svg.append('circle')
        .attr('class', `packet ${data.protocol} ${data.success ? 'success' : 'error'}`)
        .attr('r', 10 + Math.min(8, data.size / 50)) // Increased size for better visibility
        .attr('cx', fromPos.x)
        .attr('cy', fromPos.y)
        .attr('fill', packetColor)
        .attr('stroke', 'white')
        .attr('stroke-width', 3) // Thicker stroke
        .style('filter', 'drop-shadow(0px 3px 5px rgba(0,0,0,0.3))'); // Add drop shadow
    
    // Add a pulse effect
    packet.append('animate')
        .attr('attributeName', 'r')
        .attr('values', `${10 + Math.min(8, data.size / 50)};${14 + Math.min(8, data.size / 50)};${10 + Math.min(8, data.size / 50)}`)
        .attr('dur', '0.8s')
        .attr('repeatCount', 'indefinite');
    
    // Add a glow effect
    svg.append('defs')
        .append('filter')
        .attr('id', `glow-${Date.now()}`)
        .append('feGaussianBlur')
        .attr('stdDeviation', '2.5')
        .attr('result', 'coloredBlur');
    
    // Animate packet movement
    packet.transition()
        .duration(data.protocol === 'udp' ? 800 : 1200) // UDP is faster
        .attr('cx', toPos.x)
        .attr('cy', toPos.y)
        .on('end', function() {
            // If error or packet lost, show visual indicator
            if (!data.success) {
                d3.select(this)
                    .transition()
                    .duration(300)
                    .attr('r', 20)
                    .attr('opacity', 0)
                    .remove();
                
                // Add error symbol
                svg.append('text')
                    .attr('x', toPos.x)
                    .attr('y', toPos.y)
                    .attr('text-anchor', 'middle')
                    .attr('dy', '0.3em')
                    .attr('fill', '#e74c3c')
                    .attr('font-size', '28px') // Larger error symbol
                    .text('×')
                    .transition()
                    .duration(800)
                    .attr('opacity', 0)
                    .remove();
            } else {
                // Successfully delivered packet
                d3.select(this)
                    .transition()
                    .duration(300)
                    .attr('r', 0)
                    .remove();
                
                // Pulse the receiving node
                svg.selectAll('.client-node')
                    .filter(function() {
                        return d3.select(this).attr('transform') === `translate(${toPos.x}, ${toPos.y})`;
                    })
                    .select('circle')
                    .classed('pulse', true)
                    .transition()
                    .duration(300)
                    .attr('r', 35)
                    .transition()
                    .duration(300)
                    .attr('r', 25)
                    .on('end', function() {
                        d3.select(this).classed('pulse', false);
                    });
                
                // If TCP protocol, send back an ACK
                if (data.protocol === 'tcp' && !data.type) {
                    setTimeout(() => {
                        animatePacket({
                            from: data.to,
                            to: data.from,
                            protocol: 'tcp',
                            type: 'ack',
                            size: 0,
                            success: true
                        });
                    }, 300);
                }
            }
        });
}

// Initialize handshake visualization on page load 
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing handshake visualization');
    setTimeout(simulateHandshake, 1000); // Start handshake simulation after a delay
});

function simulateHandshake() {
    // Check if handshake elements exist
    const synStep = document.getElementById('syn');
    const synAckStep = document.getElementById('syn-ack');
    const ackStep = document.getElementById('ack');
    
    if (!synStep || !synAckStep || !ackStep) {
        console.error('TCP Handshake elements not found');
        return;
    }
    
    console.log('Starting TCP handshake animation');
    
    // Reset handshake steps
    document.querySelectorAll('.handshake-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Ensure step arrows have the correct classes
    if (synStep.querySelector('.step-arrow')) {
        synStep.querySelector('.step-arrow').classList.add('right');
    }
    if (synAckStep.querySelector('.step-arrow')) {
        synAckStep.querySelector('.step-arrow').classList.add('left');
    }
    if (ackStep.querySelector('.step-arrow')) {
        ackStep.querySelector('.step-arrow').classList.add('right');
    }
    
    // SYN
    setTimeout(() => {
        console.log('SYN step activated');
        synStep.classList.add('active');
    }, 500);
    
    // SYN-ACK
    setTimeout(() => {
        console.log('SYN-ACK step activated');
        synAckStep.classList.add('active');
    }, 1500);
    
    // ACK
    setTimeout(() => {
        console.log('ACK step activated');
        ackStep.classList.add('active');
    }, 2500);
    
    // Reset after 5 seconds to repeat
    setTimeout(() => {
        document.querySelectorAll('.handshake-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Restart the animation after a pause
        setTimeout(() => {
            simulateHandshake();
        }, 2000);
    }, 5000);
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function generatePacketId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateRandomPort(clientId) {
    // Generate deterministic "random" port for a client
    return 49152 + (clientId * 37) % 16383; // Range 49152-65535 (ephemeral ports)
}

function generateSequenceNumber() {
    // Simulated TCP sequence number (random 32-bit number)
    return Math.floor(Math.random() * 4294967295);
}

function generateChecksum() {
    // Generate a simulated hex checksum
    const hex = '0123456789abcdef';
    let result = '0x';
    for (let i = 0; i < 4; i++) {
        result += hex[Math.floor(Math.random() * 16)];
    }
    return result;
}