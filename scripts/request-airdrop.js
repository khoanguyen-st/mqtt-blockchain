const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

async function requestAirdrop(publicKeyString) {
  // Connect to devnet
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const publicKey = new PublicKey(publicKeyString);

  console.log("Requesting airdrop for:", publicKeyString);
  console.log("Network: Devnet");

  try {
    // Request 2 SOL
    const signature = await connection.requestAirdrop(
      publicKey,
      2 * LAMPORTS_PER_SOL
    );

    console.log("Airdrop requested! Signature:", signature);
    console.log("Waiting for confirmation...");

    await connection.confirmTransaction(signature);

    console.log("✅ Airdrop confirmed!");

    // Check balance
    const balance = await connection.getBalance(publicKey);
    console.log("New balance:", balance / LAMPORTS_PER_SOL, "SOL");
  } catch (error) {
    console.error("❌ Airdrop failed:", error.message);

    if (error.message.includes("429")) {
      console.log("");
      console.log("Rate limited. Please try:");
      console.log("1. Wait 1 hour and try again");
      console.log("2. Use Solana faucet: https://faucet.solana.com");
    }
  }
}

// Get public key from command line
const publicKey = process.argv[2];

if (!publicKey) {
  console.error("Usage: node request-airdrop.js <public_key>");
  process.exit(1);
}

requestAirdrop(publicKey);
