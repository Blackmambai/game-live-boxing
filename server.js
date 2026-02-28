// ==========================================
// KODE SERVER PENJEMBATAN TIKTOK LIVE (VERSI DEPLOY RAILWAY)
// ==========================================
const { WebcastPushConnection } = require('tiktok-live-connector');
const { Server } = require('socket.io');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS diatur agar bisa menerima koneksi dari domain Railway
const io = new Server(server, { cors: { origin: "*" } });

// Mengizinkan server membaca file HTML statis kita (index.html & gift.html)
app.use(express.static(__dirname));

// Rute untuk Layar Utama Arena
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rute untuk Panel Operator
app.get('/operator', (req, res) => {
    res.sendFile(path.join(__dirname, 'gift.html'));
});

// Rute Health Check (Sangat berguna untuk platform cloud seperti Railway memantau status aplikasi)
app.get('/health', (req, res) => {
    res.status(200).send('Server is healthy and running!');
});

let tiktokLiveConnection = null;
let currentUsername = "";

// ==========================================
// STATE: KONFIGURASI MEKANIK ARENA
// ==========================================
let arenaConfig = {
    targetGifts: 5,
    targetLikes: 30,
    likesForOneHp: 5,
    damagePower: 1
};

io.on('connection', (socket) => {
    console.log("🌐 Klien (Browser) terhubung ke server backend.");

    // Kirim status & config saat ini ke browser yang baru buka
    socket.emit('tiktok-status', { 
        connected: tiktokLiveConnection !== null, 
        username: currentUsername 
    });
    socket.emit('config-update', arenaConfig); // Kirim aturan mekanik ke browser

    // ==========================================
    // MENDENGARKAN PERUBAHAN PENGATURAN DARI OPERATOR
    // ==========================================
    socket.on('update-config', (newConfig) => {
        arenaConfig = { ...arenaConfig, ...newConfig };
        console.log("\n⚙️ Konfigurasi Arena Diperbarui:", arenaConfig);
        io.emit('config-update', arenaConfig); // Sebarkan aturan baru ke semua layar (termasuk index.html)
    });

    // 1. MENDENGARKAN PERINTAH CONNECT DARI PANEL OPERATOR
    socket.on('set-tiktok-username', (username) => {
        console.log(`\n🔄 Menerima perintah koneksi ke: @${username}...`);

        if (tiktokLiveConnection) {
            try { tiktokLiveConnection.disconnect(); } catch(e) {}
            tiktokLiveConnection = null;
        }

        currentUsername = username;
        tiktokLiveConnection = new WebcastPushConnection(username);

        tiktokLiveConnection.connect().then(state => {
            console.info(`✅ BERHASIL TERHUBUNG KE TIKTOK LIVE: @${username}`);
            io.emit('tiktok-status', { connected: true, username: username });
        }).catch(err => {
            console.error(`❌ GAGAL TERHUBUNG ke @${username}`);
            tiktokLiveConnection = null;
            currentUsername = "";
            socket.emit('tiktok-status', { connected: false, error: "Gagal: Pastikan username benar & sedang Live." });
        });

        tiktokLiveConnection.on('member', data => { io.emit('tiktok-join', { username: "@" + data.uniqueId }); });
        tiktokLiveConnection.on('like', data => { io.emit('tiktok-like', { username: "@" + data.uniqueId, amount: data.likeCount }); });
        tiktokLiveConnection.on('gift', data => { io.emit('tiktok-gift', { username: "@" + data.uniqueId, amount: data.repeatCount }); });

        tiktokLiveConnection.on('disconnected', () => {
            console.log(`⚠️ Live @${username} telah berakhir atau terputus.`);
            io.emit('tiktok-status', { connected: false, error: "Live terputus/berakhir." });
            tiktokLiveConnection = null;
        });
    });

    // 2. MENDENGARKAN PERINTAH DISCONNECT DARI PANEL OPERATOR
    socket.on('disconnect-tiktok', () => {
        if (tiktokLiveConnection) {
            console.log(`\n🛑 Memutuskan koneksi dari: @${currentUsername} (Perintah Operator)`);
            try { tiktokLiveConnection.disconnect(); } catch(e) {}
            tiktokLiveConnection = null;
            currentUsername = "";
            io.emit('tiktok-status', { connected: false, error: "Koneksi diputus oleh Operator." });
        }
    });
});

// Railway otomatis memberikan environment variable PORT.
// Penggunaan '0.0.0.0' diwajibkan untuk kontainer cloud (seperti Docker/Railway)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server berjalan online di port ${PORT}`);
});