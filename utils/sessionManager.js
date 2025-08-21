const fs = require("fs");
const path = require("path");
const sessionFile = path.join(__dirname, "../sessions/sessions.json");

let sessions = {};

// Load session dari file
if (fs.existsSync(sessionFile)) {
    sessions = JSON.parse(fs.readFileSync(sessionFile));
}

// Simpan session ke file
function saveSessions() {
    fs.writeFileSync(sessionFile, JSON.stringify(sessions, null, 2));
}

// Set session user
function setSession(user, data) {
    sessions[user] = { ...data, updatedAt: Date.now() };
    saveSessions();
}

// Get session user
function getSession(user) {
    return sessions[user] || null;
}

// Hapus session user
function clearSession(user) {
    delete sessions[user];
    saveSessions();
}

module.exports = { setSession, getSession, clearSession };
