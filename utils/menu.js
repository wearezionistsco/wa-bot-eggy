const { Buttons, List } = require("whatsapp-web.js");

function mainMenu() {
    return new Buttons(
        "Silakan pilih layanan yang tersedia 👇",
        [{ body: "TOP UP" }, { body: "PESAN PRIBADI" }, { body: "IZIN PANGGILAN" }],
        "📋 MENU UTAMA",
        "Mohon pilih salah satu"
    );
}

function topUpMenu() {
    return new Buttons(
        "Pilih nominal Top Up:",
        [
            { body: "150K" }, { body: "200K" }, { body: "300K" },
            { body: "500K" }, { body: "1/2" }, { body: "1" }, { body: "⬅ Kembali" }
        ],
        "💳 TOP UP",
        "Klik pilihan di bawah"
    );
}

function confirmTopUp(nominal) {
    return new Buttons(
        `Anda memilih Top Up sebesar ${nominal}.\nApakah Anda yakin?`,
        [{ body: "✅ Yakin" }, { body: "⬅ Ubah" }],
        "Konfirmasi",
        "Pilih salah satu"
    );
}

function topUpMethod() {
    return new Buttons(
        "Pilih metode Top Up:",
        [{ body: "BON" }, { body: "BAYAR" }],
        "Metode",
        "Silakan pilih"
    );
}

function pesanPribadiMenu() {
    return new Buttons(
        "Pilih jenis pesan pribadi:",
        [
            { body: "BON" }, { body: "GADAI" }, { body: "GADAI HP" },
            { body: "TEBUS GADAI" }, { body: "LAIN-LAIN" }, { body: "⬅ Kembali" }
        ],
        "📩 PESAN PRIBADI",
        "Klik salah satu"
    );
}

module.exports = { mainMenu, topUpMenu, confirmTopUp, topUpMethod, pesanPribadiMenu };
