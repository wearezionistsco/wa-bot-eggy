const fs = require("fs");
const { Client, LocalAuth, Buttons } = require("whatsapp-web.js");

// ================= CONFIG =================
const ADMIN = "6287756266682@c.us"; // ganti nomor admin
const EXCLUDED_NUMBERS = [ADMIN]; // nomor yang tidak diproses bot
const SESSION_FILE = "./sessions.json";

let userState = {};   // state tiap user
let IZIN_TELEPON = []; // nomor yang diizinkan telpon

// load session dari file
if (fs.existsSync(SESSION_FILE)) {
  userState = JSON.parse(fs.readFileSync(SESSION_FILE));
}

// simpan session
function saveSession() {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(userState, null, 2));
}

// ================= MENU =================
function menuUtama() {
  return new Buttons(
    "📌 Mohon pilih menu berikut:",
    [
      { body: "TOP UP" },
      { body: "PESAN PRIBADI" },
      { body: "IZIN PANGGILAN" }
    ],
    "MENU UTAMA",
    "Silakan pilih salah satu"
  );
}

function menuTopUp() {
  return new Buttons(
    "💰 Pilih nominal top up:",
    [
      { body: "150K" },
      { body: "200K" },
      { body: "300K" },
      { body: "500K" },
      { body: "1/2" },
      { body: "1" }
    ],
    "TOP UP",
    "Pilih nominal"
  );
}

function menuPesanPribadi() {
  return new Buttons(
    "✉ Pilih jenis pesan pribadi:",
    [
      { body: "BON" },
      { body: "GADAI" },
      { body: "GADAI HP" },
      { body: "TEBUS GADAI" },
      { body: "LAIN-LAIN" }
    ],
    "PESAN PRIBADI",
    "Silakan pilih"
  );
}

function menuBayarBon(nominal) {
  return new Buttons(
    `Anda memilih TOP UP ${nominal}.\n\nKonfirmasi pembayaran:`,
    [{ body: "BAYAR" }, { body: "BON" }, { body: "KEMBALI" }],
    "KONFIRMASI TOP UP",
    "Silakan pilih"
  );
}

// ================= CLIENT =================
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("🔑 Scan QR di sini:");
  console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
});

client.on("ready", () => {
  console.log("✅ Bot WhatsApp aktif!");
});

// ================= HANDLER CHAT =================
client.on("message", async (msg) => {
  const chat = msg.body.trim();
  const from = msg.from;

  // 🚫 Skip jika nomor excluded
  if (EXCLUDED_NUMBERS.includes(from)) return;

  // --- command admin ---
  if (from === ADMIN && chat.toLowerCase().startsWith("close")) {
    const parts = chat.split(" ");
    if (parts.length === 2) {
      const nomor = parts[1] + "@c.us";
      delete userState[nomor];
      saveSession();
      return msg.reply(`✅ Session untuk ${nomor} ditutup.`);
    } else {
      userState = {};
      saveSession();
      return msg.reply("✅ Semua session ditutup.");
    }
  }

  // --- jika user baru atau tidak ada state ---
  if (!userState[from]) {
    userState[from] = { state: "menu", lastActive: Date.now() };
    saveSession();
    return msg.reply(menuUtama());
  }

  const state = userState[from].state;
  userState[from].lastActive = Date.now();
  saveSession();

  // --- Menu utama ---
  if (chat === "TOP UP") {
    userState[from].state = "topup";
    saveSession();
    return msg.reply(menuTopUp());
  }
  if (chat === "PESAN PRIBADI") {
    userState[from].state = "pesan";
    saveSession();
    return msg.reply(menuPesanPribadi());
  }
  if (chat === "IZIN PANGGILAN") {
    userState[from].state = "izin_call";
    saveSession();
    return msg.reply("📞 Permintaan izin panggilan telah dikirim ke admin. Tunggu konfirmasi.");
  }

  // --- Sub menu TOP UP ---
  if (state === "topup") {
    const nominal = ["150K","200K","300K","500K","1/2","1"].find(n => n === chat);
    if (nominal) {
      userState[from].state = "topup_confirm";
      userState[from].nominal = nominal;
      saveSession();
      return msg.reply(menuBayarBon(nominal));
    } else {
      return msg.reply("❌ Pilihan tidak valid. Silakan pilih dari tombol.");
    }
  }

  if (state === "topup_confirm") {
    if (chat === "BAYAR") {
      userState[from].state = "pending_bayar";
      saveSession();
      return msg.reply("✅ Pembayaran Anda sedang diproses admin.");
    }
    if (chat === "BON") {
      userState[from].state = "pending_bon";
      saveSession();
      return msg.reply("🕒 Permintaan BON sedang menunggu persetujuan admin.");
    }
    if (chat === "KEMBALI") {
      userState[from].state = "topup";
      saveSession();
      return msg.reply(menuTopUp());
    }
  }

  // --- Sub menu Pesan Pribadi ---
  if (state === "pesan") {
    if (["BON","GADAI","GADAI HP","TEBUS GADAI","LAIN-LAIN"].includes(chat)) {
      userState[from].state = "pending_pesan";
      saveSession();
      return msg.reply(`📌 Pesan pribadi "${chat}" dicatat. Menunggu admin.`);
    } else {
      return msg.reply("❌ Pilihan tidak valid. Silakan pilih dari tombol.");
    }
  }

  // --- default jika tidak dikenali ---
  return msg.reply("❌ Pilihan tidak valid. Silakan gunakan tombol menu.");
});

// ================= HANDLER PANGGILAN =================
client.on("call", async (call) => {
  if (!IZIN_TELEPON.includes(call.from)) {
    await call.reject();
    client.sendMessage(call.from, "❌ Maaf, panggilan ke admin tidak diizinkan.\nGunakan menu IZIN PANGGILAN untuk meminta izin.");
    console.log("❌ Panggilan ditolak dari:", call.from);
  } else {
    console.log("✅ Panggilan diizinkan dari:", call.from);
  }
});

// Jalankan bot
client.initialize();
