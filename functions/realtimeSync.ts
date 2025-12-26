import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const connections = new Map();

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if this is a WebSocket upgrade request
        if (req.headers.get('upgrade') === 'websocket') {
            const { socket, response } = Deno.upgradeWebSocket(req);

            socket.onopen = () => {
                console.log(`User ${user.email} connected`);
                connections.set(user.email, socket);
                
                socket.send(JSON.stringify({
                    type: 'connected',
                    message: 'Real-time sync enabled',
                    userId: user.id
                }));
            };

            socket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'location_update') {
                        // Broadcast location update to all connected users
                        const updateMessage = JSON.stringify({
                            type: 'user_location',
                            userId: user.id,
                            email: user.email,
                            location: data.location,
                            heading: data.heading,
                            unitName: data.unitName,
                            timestamp: new Date().toISOString()
                        });
                        
                        connections.forEach((conn, email) => {
                            if (email !== user.email && conn.readyState === WebSocket.OPEN) {
                                conn.send(updateMessage);
                            }
                        });
                    }
                    
                    if (data.type === 'refresh_calls') {
                        // Fetch and broadcast updated active calls
                        const calls = await fetchActiveCalls(base44);
                        const callsMessage = JSON.stringify({
                            type: 'active_calls_update',
                            calls: calls,
                            timestamp: new Date().toISOString()
                        });
                        
                        connections.forEach((conn) => {
                            if (conn.readyState === WebSocket.OPEN) {
                                conn.send(callsMessage);
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            };

            socket.onclose = () => {
                console.log(`User ${user.email} disconnected`);
                connections.delete(user.email);
            };

            return response;
        }

        return Response.json({ 
            success: false, 
            error: 'Expected WebSocket upgrade request' 
        }, { status: 400 });

    } catch (error) {
        console.error('Error in realtime sync:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function fetchActiveCalls(base44) {
    try {
        const response = await fetch('https://gractivecalls.com/');
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('table tbody tr');
        
        const calls = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 6) {
                const status = cells[5].textContent.trim();
                if (status.includes('Enroute') || status.includes('ENROUTE') || 
                    status.includes('Dispatched') || status.includes('DISPATCHED') || 
                    status.includes('Arrived') || status.includes('ARRIVED') ||
                    status.includes('ARV')) {
                    calls.push({
                        timeReceived: cells[0].textContent.trim(),
                        incident: cells[1].textContent.trim(),
                        location: cells[2].textContent.trim(),
                        city: cells[3].textContent.trim(),
                        agency: cells[4].textContent.trim(),
                        status: status
                    });
                }
            }
        });
        
        return calls;
    } catch (error) {
        console.error('Error fetching active calls:', error);
        return [];
    }
}