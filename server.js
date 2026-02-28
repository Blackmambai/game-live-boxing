// ==========================================
// KODE SERVER PENJEMBATAN TIKTOK LIVE (DINAMIS)
// ==========================================
const { WebcastPushConnection } = require('tiktok-live-connector');
const { Server } = require('socket.io');

const io = new Server(3000, { cors: { origin: "*" } });

let tiktokLiveConnection = null;
let currentUsername = "";

// ==========================================
// STATE: KONFIGURASI MEKANIK ARENA
// ==========================================
let arenaConfig = {
    targetGifts: 5,
    targetLikes: 30,
    likesForOneHp: 15,
    damagePower: 1,
};

io.on('connection', (socket) => {
    console.log("🌐 Browser terhubung ke server mesin.");

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

console.log("🚀 Server Mesin menyala di port 3000.");
console.log("👉 Silakan buka Panel Operator (gift.html) untuk mengatur koneksi.");