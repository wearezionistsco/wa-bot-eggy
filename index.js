const { Client, LocalAuth, Buttons } = require("whatsapp-web.js");

// ================= CONFIG =================
const BOT_NUMBER = "681256513331@c.us"; 
const EXCLUDED_NUMBERS = [BOT_NUMBER]; 
const IGNORED_NUMBERS = ["6285179911407@c.us"];

let sessions = {}; 
let IZIN_TELEPON = []; 

// ================= MENU =================
function menuUtama() {
  return new Buttons(
    "📌 Mohon pilih menu utama:",
    [
      { body: "TOP UP" },
      { body: "PESAN PRIBADI" },
      { body: "IZIN PANGGILAN" }
    ],
    "Menu Utama",
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
    "Pilih nominal:"
  );
}

function menuPesanPribadi() {
  return new Buttons(
    "✉ Jenis pesan pribadi:",
    [
      { body: "BON" },
      { body: "GADAI" },
      { body: "GADAI HP" },
      { body: "TEBUS GADAI" },
      { body: "LAIN-LAIN" }
    ],
    "Pesan Pribadi",
    "Silakan pilih:"
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
  console.log("🔑 Scan QR di browser:");
  console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
});

client.on("ready", () => {
  console.log("✅ Bot WhatsApp aktif!");
});

// ================= HANDLER CHAT =================
client.on("message", async (msg) => {
  const from = msg.from;
  const chat = msg.body.trim();

  if (EXCLUDED_NUMBERS.includes(from)) return;
  if (IGNORED_NUMBERS.includes(from)) return;

  console.log(`📩 ${from}: ${chat}`);

  if (!sessions[from]) {
    sessions[from] = { state: "menu", timestamp: Date.now(), timeout: 5 * 60 * 1000 };
    return msg.reply(menuUtama());
  }

  let userSession = sessions[from];
  userSession.timestamp = Date.now();

  if (chat === "TOP UP" && userSession.state === "menu") {
    userSession.state = "topup";
    userSession.timeout = 5 * 60 * 1000;
    return msg.reply(menuTopUp());
  }

  if (chat === "PESAN PRIBADI" && userSession.state === "menu") {
    userSession.state = "pesan";
    userSession.timeout = 60 * 60 * 1000;
    return msg.reply(menuPesanPribadi());
  }

  if (chat === "IZIN PANGGILAN" && userSession.state === "menu") {
    userSession.state = "izin";
    userSession.timeout = 5 * 60 * 1000;
    return msg.reply("📞 Permintaan izin panggilan dikirim ke admin.");
  }

  if (userSession.state === "topup") {
    const pilihan = ["150K","200K","300K","500K","1/2","1"];
    if (pilihan.includes(chat)) {
      userSession.state = "topup_konfirmasi";
      userSession.nominal = chat;
      userSession.timeout = 5 * 60 * 1000;
      return msg.reply(
        new Buttons(
          `Anda memilih TOP UP ${chat}. Apakah Anda yakin?`,
          [{ body: "YA, LANJUTKAN" }, { body: "UBAH NOMINAL" }],
          "Konfirmasi Top Up",
          "Mohon konfirmasi"
        )
      );
    }
  }

  if (userSession.state === "topup_konfirmasi") {
    if (chat === "YA, LANJUTKAN") {
      userSession.state = "topup_pending";
      userSession.timeout = 60 * 60 * 1000; 
      return msg.reply(`✅ Top up ${userSession.nominal} sedang diproses. Mohon tunggu admin.`);
    }
    if (chat === "UBAH NOMINAL") {
      userSession.state = "topup";
      userSession.timeout = 5 * 60 * 1000;
      return msg.reply(menuTopUp());
    }
  }

  if (userSession.state === "pesan") {
    const opsi = ["BON","GADAI","GADAI HP","TEBUS GADAI","LAIN-LAIN"];
    if (opsi.includes(chat)) {
      userSession.state = "pesan_pending";
      userSession.timeout = 60 * 60 * 1000; 
      return msg.reply(`📌 Pesan pribadi (${chat}) diterima. Mohon tunggu admin.`);
    }
  }

  return msg.reply("❌ Pilihan tidak valid. Silakan gunakan tombol menu.");
});

// ================= HANDLER PANGGILAN =================
client.on("call", async (call) => {
  if (EXCLUDED_NUMBERS.includes(call.from)) return;
  if (!IZIN_TELEPON.includes(call.from)) {
    await call.reject();
    client.sendMessage(call.from, "❌ Maaf, panggilan tidak diizinkan. Silakan gunakan chat.");
    console.log("Panggilan ditolak dari:", call.from);
  }
});

// ================= SESSION TIMEOUT CHECKER =================
setInterval(() => {
  const now = Date.now();
  for (let num in sessions) {
    let s = sessions[num];
    if (now - s.timestamp > s.timeout) {
      console.log(`⌛ Session expired untuk ${num}`);
      sessions[num] = { state: "menu", timestamp: now, timeout: 5 * 60 * 1000 };
      client.sendMessage(num, "⏳ Waktu habis. Kembali ke menu utama.", { buttons: menuUtama().buttons });
    }
  }
}, 60 * 1000);

client.initialize();
