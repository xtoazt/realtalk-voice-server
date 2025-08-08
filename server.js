// Socket.IO signaling server for RealTalk voice chat
const http = require('http')
const { Server } = require('socket.io')

const PORT = process.env.PORT || 4000
const server = http.createServer()

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://realchatfr.vercel.app", // Replace with your actual Vercel URL
      /\.vercel\.app$/,
      /\.realtalk\./
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// roomId -> Set(socket.id)
const roomToSockets = new Map()
// socket.id -> { roomId, userId }
const socketInfo = new Map()

console.log(`[voice] Starting Socket.IO signaling server...`)

io.on('connection', (socket) => {
  console.log(`[voice] Client connected: ${socket.id}`)

  socket.on('join-room', ({ roomId, userId }) => {
    if (!roomId || !userId) return
    
    console.log(`[voice] User ${userId} joining room ${roomId}`)
    
    socket.join(roomId)
    socketInfo.set(socket.id, { roomId, userId })

    if (!roomToSockets.has(roomId)) roomToSockets.set(roomId, new Set())
    roomToSockets.get(roomId).add(socket.id)

    // Notify others in room
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userId })

    // Send back current peers in the room to the new user
    const peers = Array.from(roomToSockets.get(roomId)).filter((id) => id !== socket.id)
    socket.emit('room-peers', peers.map((id) => ({ socketId: id, userId: socketInfo.get(id)?.userId })))
    
    console.log(`[voice] Room ${roomId} now has ${roomToSockets.get(roomId).size} users`)
  })

  socket.on('signal-offer', ({ to, description }) => {
    io.to(to).emit('signal-offer', { from: socket.id, description })
  })

  socket.on('signal-answer', ({ to, description }) => {
    io.to(to).emit('signal-answer', { from: socket.id, description })
  })

  socket.on('signal-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('signal-ice-candidate', { from: socket.id, candidate })
  })

  socket.on('leave-room', () => {
    const info = socketInfo.get(socket.id)
    if (!info) return
    const { roomId, userId } = info
    
    console.log(`[voice] User ${userId} leaving room ${roomId}`)
    
    socket.leave(roomId)
    socketInfo.delete(socket.id)
    const set = roomToSockets.get(roomId)
    if (set) {
      set.delete(socket.id)
      if (set.size === 0) roomToSockets.delete(roomId)
    }
    socket.to(roomId).emit('user-left', { socketId: socket.id, userId })
  })

  socket.on('disconnect', () => {
    console.log(`[voice] Client disconnected: ${socket.id}`)
    const info = socketInfo.get(socket.id)
    if (!info) return
    const { roomId, userId } = info
    socketInfo.delete(socket.id)
    const set = roomToSockets.get(roomId)
    if (set) {
      set.delete(socket.id)
      if (set.size === 0) roomToSockets.delete(roomId)
    }
    socket.to(roomId).emit('user-left', { socketId: socket.id, userId })
  })
})

server.listen(PORT, () => {
  console.log(`[voice] Socket.IO signaling server listening on port ${PORT}`)
  console.log(`[voice] CORS enabled for Vercel domains`)
})

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      status: 'ok', 
      rooms: roomToSockets.size,
      connections: socketInfo.size 
    }))
  }
})

