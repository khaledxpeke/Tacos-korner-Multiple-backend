const crypto = require('crypto');

const algorithm = 'aes-256-cbc'; // Using a standard and secure algorithm
const secretKey = process.env.ENCRYPTION_KEY; // Your secret key from .env
const iv = crypto.randomBytes(16); // Initialization Vector

const encrypt = (text) => {
    if (!secretKey || secretKey.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a 32-byte key.');
    }
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (hash) => {
    if (!secretKey || secretKey.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a 32-byte key.');
    }
    const [ivHex, encryptedHex] = hash.split(':');
    if (!ivHex || !encryptedHex) {
        // If the password is not in the new format, return it as is (for backward compatibility)
        return hash;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString();
};

module.exports = { encrypt, decrypt };
