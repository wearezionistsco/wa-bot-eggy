const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");

// ================= CONFIG =================
const ADMIN = "6287756266682@c.us"; // nomor admin
const EXCLUDED_NUMBERS = [ADMIN];   // nomor yang tidak auto-reject call

const STORAGE_PATH = "./storage";
const DATA_FILE = path.join(STORAGE_PATH, "data", "sessions.json");
const LOG_DIR = path.join(STORAGE_PATH, "logs");

// pastikan folder ada
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// load session user
let userState = {};
if (fs.existsSync(DATA_FILE)) {
  userState = JSON.parse(fs.readFileSync(DATA_FILE));
}

// simpan ke file
function saveSessions() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userState, null, 2));
}

// log helper
function writeLog(message) {
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

// ================= MENU =================
const menuUtama = `
📌 MENU UTAMA
1️⃣ TOP UP
2️⃣ PESAN PRIBADI
0️⃣ MENU
`;

const menuTopUp = `
💰 TOP UP
1. 150
2. 200
3. 300
4. 500
5. 1/2
6. 1
0. Kembali
`;

const menuPesanPribadi = `
✉ PESAN PRIBADI
1. Bon
2. Gadai
3. HP
4. Barang Lain
5. Telepon Admin
0. Kembali
`;

// ================= CLIENT =================
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(STORAGE_PATH, ".wwebjs_auth"),
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// QR Code muncul di log Railway (bukan ke admin)
client.on("qr", (qr) => {
  const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  console.log("🔑 Scan QR lewat link ini (buka di browser):", qrLink);
});

// Bot siap
client.on("ready", () => {
  console.log("✅ Bot WhatsApp aktif!");
  client.sendMessage(ADMIN, "✅ Bot sudah online.");
});

// ================= HANDLER CHAT =================
client.on("message", async (msg) => {
  const chat = msg.body.trim();
  const from = msg.from;

  writeLog(`${from}: ${chat}`);

  // selalu tampilkan menu jika user baru
  if (!userState[from]) {
    userState[from] = "menu";
    saveSessions();
    return msg.reply("👋 Selamat datang!\n" + menuUtama);
  }

  // admin command close
  if (from === ADMIN && chat.toLowerCase().startsWith("close")) {
    const parts = chat.split(" ");
    if (parts.length === 1) {
      userState = {}; // reset semua
      saveSessions();
      return msg.reply("✅ Semua sesi user ditutup.");
    } else {
      const nomor = parts[1] + "@c.us";
      delete userState[nomor];
      saveSessions();
      return msg.reply(`✅ Sesi user ${nomor} ditutup.`);
    }
  }

  // --- MENU UTAMA ---
  if (chat === "menu" || chat === "0") {
    userState[from] = "menu";
    saveSessions();
    return msg.reply(menuUtama);
  }

  // --- PILIH MENU UTAMA ---
  if (chat === "1" && userState[from] === "menu") {
    userState[from] = "topup";
    saveSessions();
    return msg.reply(menuTopUp);
  }
  if (chat === "2" && userState[from] === "menu") {
    userState[from] = "pesan";
    saveSessions();
    return msg.reply(menuPesanPribadi);
  }

  // --- SUB MENU TOP UP ---
  if (userState[from] === "topup") {
    if (["1","2","3","4","5","6"].includes(chat)) {
      const nominal = ["150","200","300","500","1/2","1"][parseInt(chat)-1];
      userState[from] = "menu";
      saveSessions();
      return msg.reply(`✅ TOP UP ${nominal} diproses. Terima kasih!\n\n${menuUtama}`);
    }
    if (chat === "0") {
      userState[from] = "menu";
      saveSessions();
      return msg.reply(menuUtama);
    }
    return msg.reply("❌ Pilihan tidak valid. Silakan pilih sesuai menu.");
  }

  // --- SUB MENU PESAN PRIBADI ---
  if (userState[from] === "pesan") {
    if (chat === "1") return msg.reply("📌 Bon dicatat.\n\n" + menuUtama);
    if (chat === "2") return msg.reply("📌 Gadai dicatat.\n\n" + menuUtama);
    if (chat === "3") return msg.reply("📌 HP dicatat.\n\n" + menuUtama);
    if (chat === "4") return msg.reply("📌 Barang lain dicatat.\n\n" + menuUtama);
    if (chat === "5") return msg.reply("📞 Permintaan telepon admin dikirim.\n\n" + menuUtama);
    if (chat === "0") {
      userState[from] = "menu";
      saveSessions();
      return msg.reply(menuUtama);
    }
    return msg.reply("❌ Pilihan tidak valid. Silakan pilih sesuai menu.");
  }

  // default → kirim menu
  return msg.reply("❌ Pilihan tidak dikenal.\n\n" + menuUtama);
});

// ================= HANDLER PANGGILAN =================
client.on("call", async (call) => {
  if (EXCLUDED_NUMBERS.includes(call.from)) {
    console.log("Panggilan dilewati (excluded):", call.from);
    return;
  }
  await call.reject();
  client.sendMessage(
    call.from,
    "❌ Maaf, panggilan tidak diizinkan.\nSilakan gunakan menu chat."
  );
  writeLog(`Panggilan ditolak dari ${call.from}`);
});

// Jalankan bot
client.initialize();
