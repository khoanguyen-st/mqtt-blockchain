const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const bs58 = require("bs58");
require("dotenv").config();

async function checkBalance() {
  try {
    // Load config
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
      throw new Error("Missing SOLANA_RPC_URL or SOLANA_PRIVATE_KEY");
    }

    // Connect
    const connection = new Connection(rpcUrl, "confirmed");
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

    console.log("=".repeat(60));
    console.log("WALLET STATUS");
    console.log("=".repeat(60));
    console.log("Network:", rpcUrl);
    console.log("Public Key:", wallet.publicKey.toBase58());
    console.log("");

    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;

    console.log("Balance:", balanceSOL, "SOL");

    if (balanceSOL < 0.1) {
      console.log("⚠️  WARNING: Balance is low!");
    } else {
      console.log("✅ Balance is sufficient");
    }

    // Check connection
    const blockHeight = await connection.getBlockHeight();
    console.log("");
    console.log("RPC Status: ✅ Connected");
    console.log("Block Height:", blockHeight);

    console.log("=".repeat(60));

    return { balance: balanceSOL, connected: true };
  } catch (error) {
    console.error("❌ Error:", error.message);
    return { balance: 0, connected: false };
  }
}

checkBalance();
