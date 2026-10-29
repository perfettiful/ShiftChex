// password hashing for the demo logins. stored as "salt:hash", both hex
const crypto = require("crypto");

// low cost on purpose, every test builds a fresh database and seeds 18 accounts
const COST = { N: 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(password), salt, 32, COST).toString("hex")}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const given = crypto.scryptSync(String(password), salt, 32, COST);
  return crypto.timingSafeEqual(given, Buffer.from(hash, "hex"));
}

module.exports = { hashPassword, checkPassword };
