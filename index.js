const { Client, LocalAuth, Buttons } = require("whatsapp-web.js");
const fs = require("fs");

// ================= CONFIG =================
const ADMIN = "6281256513331@c.us"; // nomor admin/bot
const EXCLUDED_NUMBERS = [ADMIN]; // nomor yang tidak dibalas bot
const SESSION_FILE = "./sessions.json";
const LOG_FILE = "./logs.txt";

// ================= SESSION & STATE =================
let userState = {};
let izinTelepon = [];

// load session user
if (fs.existsSync(SESSION_FILE)) {
  try {
    userState = JSON.parse(fs.readFileSync(SESSION_FILE));
  } catch (err) {
    console.error("Gagal load sessions:", err);
    userState = {};
  }
}

// simpan session user berkala
function saveSessions() {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(userState, null, 2));
}

// logging pesan masuk
function logMessage(from, message) {
  const log = `[${new Date().toISOString()}] ${from}: ${message}\n`;
  fs.appendFileSync(LOG_FILE, log);
}

// reset state user
function resetUser(from) {
  delete userState[from];
  saveSessions();
}

// ================= MENU =================
function menuUtama() {
  return new Buttons(
    "📌 *MENU UTAMA*\nSilakan pilih salah satu:",
    [
      { body: "TOP UP" },
      { body: "PESAN PRIBADI" },
      { body: "IZIN PANGGILAN" }
    ],
    "Pilihan tersedia",
    "Klik tombol di bawah"
  );
}

function menuTopUp() {
  return new Buttons(
    "💰 *TOP UP*\nPilih nominal:",
    [
      { body: "150K" },
      { body: "200K" },
      { body: "300K" },
      { body: "500K" },
      { body: "1/2" },
      { body: "1" },
      { body: "Kembali" }
    ],
    "Nominal Top Up",
    "Klik tombol di bawah"
  );
}

function menuPesanPribadi() {
  return new Buttons(
    "✉ *PESAN PRIBADI*\nSilakan pilih:",
    [
      { body: "BON" },
      { body: "GADAI" },
      { body: "GADAI HP" },
      { body: "TEBUS GADAI" },
      { body: "LAIN-LAIN" },
      { body: "Kembali" }
    ],
    "Pilihan Pesan",
    "Klik tombol di bawah"
  );
}

// ================= CLIENT =================
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./.wwebjs_auth"
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  console.log("🔑 Scan QR lewat link ini:");
  console.log(qrLink);
});

client.on("ready", () => {
  console.log("✅ Bot WhatsApp aktif!");
});

// ================= HANDLER CHAT =================
client.on("message", async (msg) => {
  const chat = msg.body.trim();
  const from = msg.from;

  logMessage(from, chat);

  // 🚫 skip untuk excluded number
  if (EXCLUDED_NUMBERS.includes(from)) return;

  // jika user baru / belum ada state
  if (!userState[from]) {
    userState[from] = { state: "menu", lastActive: Date.now() };
    saveSessions();
    return msg.reply(menuUtama());
  }

  userState[from].lastActive = Date.now();
  saveSessions();

  // command admin
  if (from === ADMIN) {
    if (chat.toLowerCase() === "close") {
      userState = {};
      izinTelepon = [];
      saveSessions();
      return msg.reply("✅ Semua session direset.");
    }
    if (chat.startsWith("close ")) {
      const nomor = chat.replace("close ", "").trim() + "@c.us";
      resetUser(nomor);
      return msg.reply(`Session user ${nomor} direset.`);
    }
  }

  // handle menu
  switch (userState[from].state) {
    case "menu":
      if (chat === "TOP UP") {
        userState[from].state = "topup";
        saveSessions();
        return msg.reply(menuTopUp());
      }
      if (chat === "PESAN PRIBADI") {
        userState[from].state = "pesan";
        saveSessions();
        return msg.reply(menuPesanPribadi());
      }
      if (chat === "IZIN PANGGILAN") {
        userState[from].state = "izin_call";
        saveSessions();
        return msg.reply("📞 Permintaan izin panggilan telah dikirim ke admin.");
      }
      break;

    case "topup":
      if (["150K", "200K", "300K", "500K", "1/2", "1"].includes(chat)) {
        userState[from].state = "topup_confirm";
        userState[from].nominal = chat;
        saveSessions();
        return msg.reply(
          new Buttons(
            `Anda memilih TOP UP *${chat}*.\nApakah Anda yakin?`,
            [{ body: "Ya, Proses" }, { body: "Ubah Pilihan" }],
            "Konfirmasi Top Up",
            "Pilih opsi"
          )
        );
      }
      if (chat === "Kembali") {
        userState[from].state = "menu";
        saveSessions();
        return msg.reply(menuUtama());
      }
      break;

    case "topup_confirm":
      if (chat === "Ya, Proses") {
        userState[from].state = "topup_pending";
        saveSessions();
        return msg.reply("✅ Top Up diproses, mohon tunggu konfirmasi admin.");
      }
      if (chat === "Ubah Pilihan") {
        userState[from].state = "topup";
        saveSessions();
        return msg.reply(menuTopUp());
      }
      break;

    case "pesan":
      if (["BON", "GADAI", "GADAI HP", "TEBUS GADAI", "LAIN-LAIN"].includes(chat)) {
        userState[from].state = "pesan_pending";
        userState[from].jenis = chat;
        saveSessions();
        return msg.reply(`📌 Pesan *${chat}* dicatat. Mohon tunggu respon admin.`);
      }
      if (chat === "Kembali") {
        userState[from].state = "menu";
        saveSessions();
        return msg.reply(menuUtama());
      }
      break;
  }

  // fallback invalid input
  return msg.reply("❌ Pilihan tidak valid. Silakan pilih sesuai menu yang tersedia.");
});

// ================= HANDLER PANGGILAN =================
client.on("call", async (call) => {
  if (EXCLUDED_NUMBERS.includes(call.from)) return;

  if (!izinTelepon.includes(call.from)) {
    await call.reject();
    client.sendMessage(
      call.from,
      "❌ Maaf, panggilan tidak diizinkan. Gunakan menu IZIN PANGGILAN."
    );
  }
});

// ================= TIMEOUT SESSION =================
setInterval(() => {
  const now = Date.now();
  for (let from in userState) {
    const diff = (now - userState[from].lastActive) / 1000;
    if (diff > 3600 && ["pesan_pending", "topup_pending"].includes(userState[from].state)) {
      resetUser(from);
      client.sendMessage(from, "⏰ Sesi berakhir otomatis (1 jam). Silakan mulai dari menu utama.");
    } else if (diff > 300 && userState[from].state === "izin_call") {
      resetUser(from);
      client.sendMessage(from, "⏰ Permintaan izin panggilan kadaluarsa. Silakan ajukan ulang.");
    }
  }
}, 60000);

// Jalankan bot
client.initialize();
