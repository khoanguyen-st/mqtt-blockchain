const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const fs = require("fs");

// Generate new keypair
const wallet = Keypair.generate();

// Get keys
const publicKey = wallet.publicKey.toBase58();
const privateKey = bs58.encode(wallet.secretKey);

console.log("=".repeat(60));
console.log("SOLANA WALLET GENERATED");
console.log("=".repeat(60));
console.log("");
console.log("Public Key (safe to share):");
console.log(publicKey);
console.log("");
console.log("Private Key (KEEP SECRET):");
console.log(privateKey);
console.log("");
console.log("=".repeat(60));
console.log("IMPORTANT:");
console.log("- Save the private key in .env file");
console.log("- NEVER commit private key to Git");
console.log("- NEVER share private key with anyone");
console.log("=".repeat(60));

// Save to file for convenience (dev only!)
const walletInfo = {
  publicKey,
  privateKey,
  network: "devnet",
  generated: new Date().toISOString(),
};

fs.writeFileSync("wallet-devnet.json", JSON.stringify(walletInfo, null, 2));

console.log("");
console.log("Wallet info saved to: wallet-devnet.json");
console.log("Add to .gitignore immediately!");
