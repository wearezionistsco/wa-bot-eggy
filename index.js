// whatsapp-bot/index.js
const { Client, LocalAuth, Buttons } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

// ================= CONFIG =================
const BOT_NUMBER = "6281256513331@c.us";               // nomor WA bot (sekalian admin utama)
const ADMIN_NUMBERS = [BOT_NUMBER];                    // bisa tambah admin lain di sini
const EXCLUDED_NUMBERS = [BOT_NUMBER];                 // jangan balas diri sendiri
const IGNORED_NUMBERS  = [                             // orang tertentu: bot tidak balas otomatis
  // "6285xxxxxxxx@c.us",
];

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE  = path.join(DATA_DIR, "db.json");

// Anti spam ringan (detik)
const RATE_LIMIT_MS = 2000;

// Timeout (ms)
const FIVE_MIN = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// ================= STATE STORE (persisten) =================
let store = {
  sessions: {},          // per user: { state, timestamp, timeout, ... }
  izinTelepon: [],       // whitelist call
  lastHit: {}            // rate limit
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const json = JSON.parse(raw);
      // keamanan dasar
      store.sessions   = json.sessions   || {};
      store.izinTelepon= json.izinTelepon|| [];
      store.lastHit    = {};
    } catch (e) {
      console.error("Gagal load db.json, mulai baru:", e.message);
    }
  }
}

function saveStore() {
  try {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify({
      sessions: store.sessions,
      izinTelepon: store.izinTelepon
    }, null, 2));
  } catch (e) {
    console.error("Gagal simpan db.json:", e.message);
  }
}

// Simpan berkala
setInterval(saveStore, 15 * 1000);

// ================= UI (Buttons) =================
function menuUtama() {
  return new Buttons(
    "📌 Mohon pilih menu utama:",
    [{ body: "TOP UP" }, { body: "PESAN PRIBADI" }, { body: "IZIN PANGGILAN" }],
    "Menu Utama",
    "Silakan tekan tombol di bawah 👇"
  );
}
function menuTopUp() {
  return new Buttons(
    "💰 Pilih nominal top up:",
    [{ body: "150K" }, { body: "200K" }, { body: "300K" }, { body: "500K" }, { body: "1/2" }, { body: "1" }],
    "TOP UP",
    "Pilih salah satu 👇"
  );
}
function konfirmasiTopUp(nominal) {
  return new Buttons(
    `Anda memilih TOP UP ${nominal}. Lanjutkan atau ubah?`,
    [{ body: "LANJUTKAN" }, { body: "UBAH NOMINAL" }],
    "Konfirmasi Top Up",
    "Mohon konfirmasi 👇"
  );
}
function metodeTopUp() {
  return new Buttons(
    "Pilih metode:",
    [{ body: "BAYAR" }, { body: "BON" }],
    "Metode Top Up",
    "Pilih salah satu 👇"
  );
}
function menuPesanPribadi() {
  return new Buttons(
    "✉ Pilih jenis pesan:",
    [{ body: "BON" }, { body: "GADAI" }, { body: "GADAI HP" }, { body: "TEBUS GADAI" }, { body: "LAIN-LAIN" }],
    "Pesan Pribadi",
    "Pilih salah satu 👇"
  );
}

// ================= HELPERS =================
function isAdmin(number) {
  return ADMIN_NUMBERS.includes(number);
}
function now() { return Date.now(); }

function startSession(from, state, timeoutMs) {
  store.sessions[from] = {
    state,
    timestamp: now(),
    timeout: timeoutMs,
    data: {}
  };
}

function touchSession(from, timeoutOverride=null) {
  if (!store.sessions[from]) return;
  store.sessions[from].timestamp = now();
  if (timeoutOverride != null) store.sessions[from].timeout = timeoutOverride;
}

function resetToMenu(from, client) {
  store.sessions[from] = { state: "menu", timestamp: now(), timeout: FIVE_MIN, data: {} };
  client.sendMessage(from, "⏳ Waktu sesi habis atau selesai. Silakan pilih menu kembali.");
  client.sendMessage(from, menuUtama());
}

function rateLimited(from) {
  const last = store.lastHit[from] || 0;
  const blocked = (now() - last) < RATE_LIMIT_MS;
  store.lastHit[from] = now();
  return blocked;
}

// ================= CLIENT =================
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }), // ini yang dipersist di volume Railway
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ]
  },
});

// QR hanya di log (link), TIDAK dikirim ke admin
client.on("qr", (qr) => {
  console.log("🔑 Scan QR lewat link ini (buka di browser & scan pakai WA):");
  console.log(`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qr)}`);
});

client.on("ready", () => {
  console.log("✅ Bot WhatsApp aktif!");
  loadStore(); // load persist store saat siap
});

// ================= ADMIN COMMANDS =================
// Hanya dari ADMIN_NUMBERS (bisa tambah nomor lain selain BOT_NUMBER)
async function handleAdminCommand(msg) {
  const { from, body } = msg;
  const text = body.trim();

  // CLOSE ALL
  if (/^CLOSE\s+ALL$/i.test(text)) {
    Object.keys(store.sessions).forEach(num => {
      store.sessions[num] = { state: "menu", timestamp: now(), timeout: FIVE_MIN, data: {} };
      client.sendMessage(num, "🔁 Sesi ditutup oleh admin. Kembali ke menu utama.");
      client.sendMessage(num, menuUtama());
    });
    return msg.reply("✅ Semua sesi ditutup.");
  }

  // CLOSE <nomor>
  if (/^CLOSE\s+\d+@c\.us$/i.test(text)) {
    const target = text.split(/\s+/)[1];
    store.sessions[target] = { state: "menu", timestamp: now(), timeout: FIVE_MIN, data: {} };
    client.sendMessage(target, "🔁 Sesi ditutup oleh admin. Kembali ke menu utama.");
    client.sendMessage(target, menuUtama());
    return msg.reply(`✅ Sesi ${target} ditutup.`);
  }

  // IZIN <nomor>
  if (/^IZIN\s+\d+$/i.test(text) || /^IZIN\s+\d+@c\.us$/i.test(text)) {
    let nomor = text.split(/\s+/)[1];
    if (!nomor.endsWith("@c.us")) nomor = nomor + "@c.us";
    if (!store.izinTelepon.includes(nomor)) store.izinTelepon.push(nomor);
    client.sendMessage(nomor, "✅ Izin panggilan diberikan oleh admin. Silakan telepon sekarang.");
    return msg.reply(`✅ ${nomor} diizinkan menelepon.`);
  }

  // TOLAK <nomor>
  if (/^TOLAK\s+\d+$/i.test(text) || /^TOLAK\s+\d+@c\.us$/i.test(text)) {
    let nomor = text.split(/\s+/)[1];
    if (!nomor.endsWith("@c.us")) nomor = nomor + "@c.us";
    store.izinTelepon = store.izinTelepon.filter(n => n !== nomor);
    client.sendMessage(nomor, "❌ Izin panggilan dicabut oleh admin.");
    return msg.reply(`✅ ${nomor} ditolak izin panggilan.`);
  }

  // HELP
  if (/^HELP$/i.test(text)) {
    return msg.reply(
`🛠️ Admin Commands:
• CLOSE <nomor@c.us>  → tutup sesi user
• CLOSE ALL           → tutup semua sesi
• IZIN <nomor>        → beri izin panggilan
• TOLAK <nomor>       → cabut izin panggilan
• HELP                → bantuan`
    );
  }
  return false;
}

// ================= MESSAGE HANDLER =================
client.on("message", async (msg) => {
  const from = msg.from;
  const text = (msg.body || "").trim();

  // 1) Abaikan pesan dari bot sendiri
  if (EXCLUDED_NUMBERS.includes(from)) return;

  // 2) Jika admin → cek command (meski admin = bot, kamu bisa tambah admin lain di ADMIN_NUMBERS)
  if (isAdmin(from)) {
    const handled = await handleAdminCommand(msg);
    if (handled) return;
    // Admin bisa balas manual tanpa mengubah sesi user
    return;
  }

  // 3) Abaikan nomor khusus (biar admin balas manual)
  if (IGNORED_NUMBERS.includes(from)) {
    console.log("ℹ️ IGNORED user message:", from, text);
    return;
  }

  // 4) Anti spam ringan
  if (rateLimited(from)) return;

  // 5) Pastikan ada sesi
  if (!store.sessions[from]) {
    startSession(from, "menu", FIVE_MIN);
    console.log(`🆕 Session created for ${from} -> menu`);
    await msg.reply(menuUtama());
    return;
  }

  // 6) Update timestamp (aktifkan kembali timeout)
  touchSession(from);

  // 7) ALL INPUTS MUST BE BUTTONS
  // Jika user mengetik bebas (bukan label tombol yang kita sediakan), tolak.
  const allowedLabels = new Set([
    "TOP UP","PESAN PRIBADI","IZIN PANGGILAN",
    "150K","200K","300K","500K","1/2","1",
    "LANJUTKAN","UBAH NOMINAL",
    "BAYAR","BON",
    "GADAI","GADAI HP","TEBUS GADAI","LAIN-LAIN"
  ]);
  if (!allowedLabels.has(text.toUpperCase())) {
    await msg.reply("❌ Mohon gunakan tombol yang tersedia untuk memilih menu.");
    return;
  }

  // 8) State machine
  const s = store.sessions[from];

  // --- MENU UTAMA ---
  if (s.state === "menu") {
    if (text === "TOP UP") {
      startSession(from, "topup_select", FIVE_MIN);
      return msg.reply(menuTopUp());
    }
    if (text === "PESAN PRIBADI") {
      startSession(from, "pesan_select", ONE_HOUR); // 1 jam untuk proses pesan
      return msg.reply(menuPesanPribadi());
    }
    if (text === "IZIN PANGGILAN") {
      startSession(from, "izin_call_pending", FIVE_MIN);
      await msg.reply("📞 Permintaan izin panggilan dicatat. Mohon tunggu admin.");
      return;
    }
  }

  // --- TOP UP FLOW ---
  if (s.state === "topup_select") {
    const list = ["150K","200K","300K","500K","1/2","1"];
    if (list.includes(text)) {
      s.data.nominal = text;
      startSession(from, "topup_confirm", FIVE_MIN);
      return msg.reply(konfirmasiTopUp(text));
    }
  }

  if (s.state === "topup_confirm") {
    if (text === "LANJUTKAN") {
      startSession(from, "topup_method", FIVE_MIN);
      return msg.reply(metodeTopUp());
    }
    if (text === "UBAH NOMINAL") {
      startSession(from, "topup_select", FIVE_MIN);
      return msg.reply(menuTopUp());
    }
  }

  if (s.state === "topup_method") {
    if (text === "BAYAR") {
      startSession(from, "topup_pending", ONE_HOUR); // pending 1 jam
      return msg.reply(`✅ Top up ${s.data.nominal} (BAYAR) diproses. Mohon tunggu konfirmasi admin.`);
    }
    if (text === "BON") {
      startSession(from, "topup_pending", ONE_HOUR); // pending 1 jam
      return msg.reply(`🕒 Pengajuan BON top up ${s.data.nominal} menunggu persetujuan admin.`);
    }
  }

  // --- PESAN PRIBADI ---
  if (s.state === "pesan_select") {
    const opsi = ["BON","GADAI","GADAI HP","TEBUS GADAI","LAIN-LAIN"];
    if (opsi.includes(text)) {
      s.data.jenisPesan = text;
      startSession(from, "pesan_pending", ONE_HOUR); // pending 1 jam
      return msg.reply(`📌 Pesan pribadi (${text}) diterima. Mohon tunggu admin.`);
    }
  }

  // --- IZIN PANGGILAN ---
  if (s.state === "izin_call_pending") {
    // Tidak ada tombol lanjutan di flow ini; user menunggu admin IZIN/TOLAK
    return msg.reply("⏳ Mohon tunggu persetujuan admin untuk panggilan.");
  }

  // --- PENDING STATES: tolak input lain ---
  if (["topup_pending","pesan_pending","izin_call_pending"].includes(s.state)) {
    return msg.reply("ℹ️ Sesi sedang diproses. Mohon tunggu respon admin atau tunggu sampai sesi berakhir.");
  }

  // Fallback
  return msg.reply("❌ Pilihan tidak valid pada tahap ini. Silakan tunggu atau mulai ulang jika sesi berakhir.");
});

// ================= CALL HANDLER =================
client.on("call", async (call) => {
  const from = call.from;
  if (EXCLUDED_NUMBERS.includes(from)) return; // jangan ganggu panggilan dari bot sendiri
  // auto reject kecuali diizinkan admin
  if (!store.izinTelepon.includes(from)) {
    await call.reject();
    client.sendMessage(from, "❌ Maaf, panggilan tidak diizinkan. Silakan gunakan chat atau tunggu izin admin.");
    console.log("☎️ Call ditolak dari:", from);
  } else {
    console.log("☎️ Call diizinkan dari:", from);
  }
});

// ================= SESSION TIMEOUT WATCHER =================
setInterval(() => {
  const t = now();
  for (const num of Object.keys(store.sessions)) {
    const s = store.sessions[num];
    if (!s || !s.timeout) continue;
    if (t - s.timestamp > s.timeout) {
      // aturan timeout:
      // - izin_call_pending → 5 menit → auto close
      // - topup_pending / pesan_pending → 1 jam → auto close
      // - langkah-langkah pemilihan (menu/topup_select/confirm/method/pesan_select) → 5 menit → auto close
      console.log(`⌛ Timeout session ${num} (state=${s.state})`);
      // kirim notifikasi & tampilkan menu lagi
      resetToMenu(num, client);
    }
  }
  // persist ke disk
  saveStore();
}, 60 * 1000);

// ================= START =================
client.initialize();
