// Express & Socket.IO 기반 부루마블 멀티플레이어 서버 (Render.com 배포용)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// 정적 파일 제공
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 모든 웹 페이지 접속 허용
        methods: ["GET", "POST"]
    }
});

// 메모리 상의 방(Room) 데이터베이스
const rooms = {};

// 4자리 고유 방 코드 생성 (예: BM88)
function generateRoomCode() {
    let code;
    do {
        code = "BM" + Math.floor(10 + Math.random() * 90);
    } while (rooms[code]);
    return code;
}

io.on('connection', (socket) => {
    console.log('새 플레이어 연결됨:', socket.id);

    // 1. 방 생성 (방장)
    socket.on('CREATE_ROOM', ({ playerName, token }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            code: roomCode,
            hostId: socket.id,
            gameActive: false,
            currentTurnIndex: 0,
            propertyBuildings: {},
            players: [{
                socketId: socket.id,
                id: 0,
                name: playerName,
                token: token,
                money: 4000,
                position: 0,
                laps: 0,
                properties: [],
                isIsland: false,
                islandTurns: 0,
                bankrupt: false
            }]
        };

        socket.join(roomCode);
        socket.emit('ROOM_CREATED', { roomCode, room: rooms[roomCode] });
        console.log(`[방 생성 완료] 코드: ${roomCode}, 방장: ${playerName}`);
    });

    // 2. 방 참가 (친구들)
    socket.on('JOIN_ROOM', ({ roomCode, playerName, token }) => {
        const code = roomCode ? roomCode.toUpperCase().trim() : "";
        const room = rooms[code];

        if (!room) {
            return socket.emit('ERROR_MSG', '존재하지 않는 방 코드입니다.');
        }
        if (room.gameActive) {
            return socket.emit('ERROR_MSG', '이미 게임이 진행 중인 방입니다.');
        }
        if (room.players.length >= 4) {
            return socket.emit('ERROR_MSG', '방 정원이 초과되었습니다. (최대 4명)');
        }

        const newPlayer = {
            socketId: socket.id,
            id: room.players.length,
            name: playerName,
            token: token,
            money: 4000,
            position: 0,
            laps: 0,
            properties: [],
            isIsland: false,
            islandTurns: 0,
            bankrupt: false
        };

        room.players.push(newPlayer);
        socket.join(code);

        io.to(code).emit('ROOM_UPDATED', room);
        console.log(`[방 참가 완료] 코드: ${code}, 참가자: ${playerName}`);
    });

    // 3. 게임 시작 (방장 전용)
    socket.on('START_GAME', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.hostId === socket.id) {
            room.gameActive = true;
            io.to(roomCode).emit('GAME_STARTED', room);
            console.log(`[게임 시작] 코드: ${roomCode}`);
        }
    });

    // 4. 실시간 게임 상태 동기화 (주사위, 말 이동, 땅 구매 등)
    socket.on('SYNC_GAME_STATE', ({ roomCode, roomData }) => {
        if (rooms[roomCode]) {
            rooms[roomCode] = { ...rooms[roomCode], ...roomData };
            socket.to(roomCode).emit('STATE_UPDATED', rooms[roomCode]);
        }
    });

    // 5. 연결 해제 처리
    socket.on('disconnect', () => {
        console.log('플레이어 연결 해제:', socket.id);
        for (const code in rooms) {
            const room = rooms[code];
            const pIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (pIdx !== -1) {
                room.players.splice(pIdx, 1);
                room.players.forEach((p, i) => p.id = i);
                
                if (room.players.length === 0) {
                    delete rooms[code];
                    console.log(`[방 삭제] 코드: ${code}`);
                } else {
                    if (room.hostId === socket.id) {
                        room.hostId = room.players[0].socketId;
                    }
                    io.to(code).emit('ROOM_UPDATED', room);
                }
                break;
            }
        }
    });
});

// Render.com 포트 번호 자동 할당 (없을 시 기본 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`부루마블 Socket.IO 서버가 포트 ${PORT}에서 정상 구동 중입니다.`);
});