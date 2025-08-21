/**
 * FINAL WhatsApp Bot - whatsapp-web.js
 * Fitur:
 * - Menu tombol (TOP UP / PESAN PRIBADI / IZIN PANGGILAN) + fallback teks
 * - FLOW TOP UP: pilih nominal → konfirmasi (lanjut/ubah) → metode (BAYAR/BON) → pending (1 jam)
 * - FLOW PESAN PRIBADI: BON / GADAI / GADAI HP / TEBUS GADAI / LAIN-LAIN → pending (1 jam)
 * - IZIN PANGGILAN: minta izin → pending (5 menit) → admin bisa IZIN/TOLAK
 * - Auto reject call kecuali diizinkan
 * - Pengecualian nomor admin/bot & ignored list
 * - Rate limit anti-spam
 * - Timeout watcher (5 menit langkah pemilihan + izin call, 1 jam pending)
 * - Persist user state ke data/db.json, WA session ke .wwebjs_auth (persist via Railway Volume)
 * - Admin commands: CLOSE ALL, CLOSE <nomor>, IZIN <nomor>, TOLAK <nomor>, HELP
 */

const { Client, LocalAuth, Buttons } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

// ======================[ KONFIGURASI ]======================
const BOT_NUMBER = "6281256513331@c.us";         // nomor bot (juga admin utama)
const ADMIN_NUMBERS = [BOT_NUMBER];              // tambah admin lain di sini jika perlu
const EXCLUDED_NUMBERS = [BOT_NUMBER];           // bot tidak balas dirinya sendiri
const IGNORED_NUMBERS  = [                       // nomor yang tidak dibalas bot (admin balas manual)
  // "6285179911407@c.us",
];

// Set ini ke true bila kamu ingin hanya tombol yang diterima (ketikan ditolak).
// Jika ada user yang tidak melihat tombol (beberapa device), ganti ke false agar boleh ketik angka.
const BUTTONS_ONLY = true;

// Anti-spam sederhana
const RATE_LIMIT_MS = 2000;

// Timeout
const FIVE_MIN = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Lokasi penyimpanan state user (persist)
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE  = path.join(DATA_DIR, "db.json");

// ======================[ STATE PERSIST ]=====================
let store = {
  sessions: {},      // per nomor: {state, timestamp, timeout, data:{}}
  izinTelepon: [],   // whitelist call
  lastHit: {}        // untuk rate limit
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const j = JSON.parse(raw);
      store.sessions    = j.sessions    || {};
      store.izinTelepon = j.izinTelepon || [];
      store.lastHit     = {};
      console.log("🗃️  State loaded.");
    } catch (e) {
      console.error("⚠️  Failed to load db.json:", e.message);
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
    console.error("⚠️  Failed to save db.json:", e.message);
  }
}
setInterval(saveStore, 15 * 1000);

// ======================[ UI (Buttons + Text Fallback) ]=====================
function menuUtamaButtons() {
  return new Buttons(
    "📌 Mohon pilih menu:",
    [{ body: "TOP UP" }, { body: "PESAN PRIBADI" }, { body: "IZIN PANGGILAN" }],
    "MENU UTAMA",
    "Silakan tekan tombol di bawah 👇"
  );
}
const menuUtamaText =
`📌 MENU UTAMA
1️⃣ TOP UP
2️⃣ PESAN PRIBADI
3️⃣ IZIN PANGGILAN
(ketik angka yang sesuai)`;

function menuTopUpButtons() {
  return new Buttons(
    "💰 Pilih nominal top up:",
    [{ body: "150K" }, { body: "200K" }, { body: "300K" }, { body: "500K" }, { body: "1/2" }, { body: "1" }],
    "TOP UP",
    "Pilih salah satu 👇"
  );
}
const menuTopUpText =
`💰 TOP UP
1. 150K
2. 200K
3. 300K
4. 500K
5. 1/2
6. 1
(ketik angka 1-6)`;

function konfirmasiTopUpButtons(nominal) {
  return new Buttons(
    `Anda memilih TOP UP ${nominal}. Lanjutkan atau ubah?`,
    [{ body: "LANJUTKAN" }, { body: "UBAH NOMINAL" }],
    "KONFIRMASI",
    "Mohon konfirmasi 👇"
  );
}
const konfirmasiTopUpText = (nominal) =>
`Konfirmasi TOP UP ${nominal}
1. Lanjutkan
2. Ubah Nominal
(ketik 1/2)`;

function metodeTopUpButtons() {
  return new Buttons(
    "Pilih metode top up:",
    [{ body: "BAYAR" }, { body: "BON" }],
    "METODE",
    "Pilih salah satu 👇"
  );
}
const metodeTopUpText =
`Pilih Metode:
1. BAYAR (diproses segera)
2. BON (menunggu persetujuan admin)
(ketik 1/2)`;

// Pesan pribadi
function menuPesanButtons() {
  return new Buttons(
    "✉ Pilih jenis:",
    [{ body: "BON" }, { body: "GADAI" }, { body: "GADAI HP" }, { body: "TEBUS GADAI" }, { body: "LAIN-LAIN" }],
    "PESAN PRIBADI",
    "Pilih salah satu 👇"
  );
}
const menuPesanText =
`✉ PESAN PRIBADI
1. BON
2. GADAI
3. GADAI HP
4. TEBUS GADAI
5. LAIN-LAIN
(ketik 1-5)`;

// ======================[ HELPERS ]=====================
function isAdmin(n) { return ADMIN_NUMBERS.includes(n); }
function now() { return Date.now(); }

function startSession(from, state, timeoutMs) {
  store.sessions[from] = { state, timestamp: now(), timeout: timeoutMs, data: {} };
}

function updateSession(from, patch) {
  if (!store.sessions[from]) return;
  store.sessions[from] = { ...store.sessions[from], ...patch, timestamp: now() };
}

function resetToMenu(from, client) {
  store.sessions[from] = { state: "menu", timestamp: now(), timeout: FIVE_MIN, data: {} };
  client.sendMessage(from, "⏳ Sesi berakhir/timeout. Kembali ke menu utama.");
  if (BUTTONS_ONLY) client.sendMessage(from, menuUtamaButtons());
  else client.sendMessage(from, menuUtamaText);
}

function rateLimited(from) {
  const last = store.lastHit[from] || 0;
  const blocked = (now() - last) < RATE_LIMIT_MS;
  store.lastHit[from] = now();
  return blocked;
}

// Validasi input berdasarkan mode
function normalizeInput(txt) {
  if (!txt) return "";
  const t = txt.trim();
  if (!BUTTONS_ONLY) return t; // bebas angka atau kata kunci
  // BUTTONS_ONLY: hanya label tombol yang valid
  return t.toUpperCase();
}

// ======================[ CLIENT ]=====================
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
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
    ],
  },
});

// QR hanya di log
client.on("qr", (qr) => {
  console.log("🔑 Scan QR di browser (buka link):");
  console.log(`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qr)}`);
});

client.on("ready", () => {
  console.log("✅ Bot WhatsApp aktif!");
  loadStore();
});

// ======================[ ADMIN COMMANDS ]=====================
async function handleAdminCommand(msg) {
  const text = msg.body.trim();

  if (/^HELP$/i.test(text)) {
    await msg.reply(
`🛠️ Admin Commands:
• CLOSE ALL            → tutup semua sesi
• CLOSE <nomor@c.us>   → tutup sesi user tertentu
• IZIN <nomor>         → beri izin panggilan
• TOLAK <nomor>        → cabut izin panggilan
• HELP                 → bantuan`
    );
    return true;
  }

  if (/^CLOSE\s+ALL$/i.test(text)) {
    for (const num of Object.keys(store.sessions)) {
      resetToMenu(num, client);
    }
    await msg.reply("✅ Semua sesi ditutup.");
    return true;
  }

  if (/^CLOSE\s+\d+@c\.us$/i.test(text)) {
    const target = text.split(/\s+/)[1];
    resetToMenu(target, client);
    await msg.reply(`✅ Sesi ${target} ditutup.`);
    return true;
  }

  if (/^IZIN\s+\d+(@c\.us)?$/i.test(text)) {
    let nomor = text.split(/\s+/)[1];
    if (!nomor.endsWith("@c.us")) nomor += "@c.us";
    if (!store.izinTelepon.includes(nomor)) store.izinTelepon.push(nomor);
    client.sendMessage(nomor, "✅ Izin panggilan diberikan oleh admin. Silakan telepon sekarang.");
    await msg.reply(`✅ ${nomor} diizinkan menelepon.`);
    return true;
  }

  if (/^TOLAK\s+\d+(@c\.us)?$/i.test(text)) {
    let nomor = text.split(/\s+/)[1];
    if (!nomor.endsWith("@c.us")) nomor += "@c.us";
    store.izinTelepon = store.izinTelepon.filter(n => n !== nomor);
    client.sendMessage(nomor, "❌ Izin panggilan dicabut oleh admin.");
    await msg.reply(`✅ ${nomor} ditolak izin panggilan.`);
    return true;
  }

  return false;
}

// ======================[ MESSAGE HANDLER ]=====================
client.on("message", async (msg) => {
  const from = msg.from;
  const rawText = msg.body || "";
  const chat = normalizeInput(rawText);

  // logging
  console.log(`💬 ${from}: ${rawText}`);

  // skip excluded
  if (EXCLUDED_NUMBERS.includes(from)) return;

  // admin commands (tapi bot = admin; tambahkan admin lain di ADMIN_NUMBERS agar bisa kirim perintah)
  if (ADMIN_NUMBERS.includes(from)) {
    const handled = await handleAdminCommand(msg);
    if (handled) return;
    // kalau bukan command, biarkan admin balas manual ke user
    return;
  }

  // ignore list
  if (IGNORED_NUMBERS.includes(from)) return;

  // rate limit
  if (rateLimited(from)) return;

  // pastikan sesi ada
  if (!store.sessions[from]) {
    startSession(from, "menu", FIVE_MIN);
    if (BUTTONS_ONLY) await msg.reply(menuUtamaButtons());
    else await msg.reply(menuUtamaText);
    return;
  }

  // sentuh sesi
  updateSession(from, {});

  const s = store.sessions[from];

  // ——— VALIDASI INPUT (BUTTONS_ONLY) ———
  if (BUTTONS_ONLY) {
    const allowed = new Set([
      "TOP UP","PESAN PRIBADI","IZIN PANGGILAN",
      "150K","200K","300K","500K","1/2","1",
      "LANJUTKAN","UBAH NOMINAL",
      "BAYAR","BON",
      "GADAI","GADAI HP","TEBUS GADAI","LAIN-LAIN"
    ]);
    if (!allowed.has(chat.toUpperCase())) {
      await msg.reply("❌ Mohon gunakan tombol yang tersedia.");
      return;
    }
  } else {
    // Fallback mode angka/teks → map ke label internal
    const mapMenu = {
      "1": "TOP UP", "2":"PESAN PRIBADI", "3":"IZIN PANGGILAN",
      "150K":"150K","200K":"200K","300K":"300K","500K":"500K","1/2":"1/2","1":"1",
      "lanjutkan":"LANJUTKAN","ubah nominal":"UBAH NOMINAL",
      "bayar":"BAYAR","bon":"BON",
      "gadai":"GADAI","gadai hp":"GADAI HP","tebus gadai":"TEBUS GADAI","lain-lain":"LAIN-LAIN","lain":"LAIN-LAIN"
    };
    if (mapMenu[chat.toLowerCase()]) {
      // ubah 'chat' ke label yang benar
      msg.body = mapMenu[chat.toLowerCase()];
    } else {
      // jika tidak cocok apapun → jelaskan & tampilkan menu sesuai state
      await msg.reply("❌ Pilihan tidak valid. Mohon gunakan angka sesuai menu.");
      if (s.state === "menu") await msg.reply(menuUtamaText);
      else if (s.state === "topup_select") await msg.reply(menuTopUpText);
      else if (s.state === "topup_confirm") await msg.reply(konfirmasiTopUpText(s.data.nominal));
      else if (s.state === "topup_method") await msg.reply(metodeTopUpText);
      else if (s.state === "pesan_select") await msg.reply(menuPesanText);
      return;
    }
  }

  const input = BUTTONS_ONLY ? chat.toUpperCase() : (msg.body || "").trim();

  // ——— STATE MACHINE ———
  if (s.state === "menu") {
    if (input === "TOP UP") {
      startSession(from, "topup_select", FIVE_MIN);
      if (BUTTONS_ONLY) return msg.reply(menuTopUpButtons());
      return msg.reply(menuTopUpText);
    }
    if (input === "PESAN PRIBADI") {
      startSession(from, "pesan_select", ONE_HOUR);
      if (BUTTONS_ONLY) return msg.reply(menuPesanButtons());
      return msg.reply(menuPesanText);
    }
    if (input === "IZIN PANGGILAN") {
      startSession(from, "izin_call_pending", FIVE_MIN);
      return msg.reply("📞 Permintaan izin panggilan diterima. Mohon tunggu persetujuan admin (maks 5 menit).");
    }
  }

  if (s.state === "topup_select") {
    const list = ["150K","200K","300K","500K","1/2","1"];
    if (list.includes(input)) {
      s.data.nominal = input;
      startSession(from, "topup_confirm", FIVE_MIN);
      if (BUTTONS_ONLY) return msg.reply(konfirmasiTopUpButtons(input));
      return msg.reply(konfirmasiTopUpText(input));
    }
  }

  if (s.state === "topup_confirm") {
    if (input.toUpperCase() === "LANJUTKAN") {
      startSession(from, "topup_method", FIVE_MIN);
      if (BUTTONS_ONLY) return msg.reply(metodeTopUpButtons());
      return msg.reply(metodeTopUpText);
    }
    if (input.toUpperCase() === "UBAH NOMINAL") {
      startSession(from, "topup_select", FIVE_MIN);
      if (BUTTONS_ONLY) return msg.reply(menuTopUpButtons());
      return msg.reply(menuTopUpText);
    }
  }

  if (s.state === "topup_method") {
    if (input.toUpperCase() === "BAYAR") {
      startSession(from, "topup_pending", ONE_HOUR);
      return msg.reply(`✅ Top up ${s.data.nominal} (BAYAR) diproses. Mohon tunggu konfirmasi admin (maks 1 jam).`);
    }
    if (input.toUpperCase() === "BON") {
      startSession(from, "topup_pending", ONE_HOUR);
      return msg.reply(`🕒 Pengajuan BON top up ${s.data.nominal} menunggu persetujuan admin (maks 1 jam).`);
    }
  }

  if (s.state === "pesan_select") {
    const opsi = ["BON","GADAI","GADAI HP","TEBUS GADAI","LAIN-LAIN"];
    if (opsi.includes(input.toUpperCase())) {
      s.data.jenisPesan = input.toUpperCase();
      startSession(from, "pesan_pending", ONE_HOUR);
      return msg.reply(`📌 Pesan pribadi (${s.data.jenisPesan}) diterima. Mohon tunggu admin (maks 1 jam).`);
    }
  }

  if (["topup_pending","pesan_pending","izin_call_pending"].includes(s.state)) {
    return msg.reply("ℹ️ Sesi sedang diproses. Mohon tunggu respon admin atau sampai sesi berakhir.");
  }

  // fallback
  return msg.reply("❌ Pilihan tidak valid pada tahap ini.");
});

// ======================[ CALL HANDLER ]=====================
client.on("call", async (call) => {
  const from = call.from;
  if (EXCLUDED_NUMBERS.includes(from)) return;

  if (!store.izinTelepon.includes(from)) {
    await call.reject();
    client.sendMessage(from, "❌ Maaf, panggilan tidak diizinkan. Silakan gunakan chat atau tunggu izin admin (ketik IZIN PANGGILAN di menu).");
    console.log("☎️ Call rejected:", from);
  } else {
    console.log("☎️ Call allowed:", from);
  }
});

// ======================[ TIMEOUT WATCHER ]=====================
setInterval(() => {
  const t = now();
  for (const num of Object.keys(store.sessions)) {
    const sess = store.sessions[num];
    if (!sess || !sess.timeout) continue;
    if (t - sess.timestamp > sess.timeout) {
      console.log(`⌛ Timeout ${num} state=${sess.state}`);
      resetToMenu(num, client);
    }
  }
  saveStore();
}, 60 * 1000);

// ======================[ START ]=====================
client.initialize();
