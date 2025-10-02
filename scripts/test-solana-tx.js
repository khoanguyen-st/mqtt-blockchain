const {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey
} = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

async function testTransaction() {
  try {
    console.log('Testing Solana memo transaction...');
    console.log('');

    // Setup
    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    const wallet = Keypair.fromSecretKey(
      bs58.decode(process.env.SOLANA_PRIVATE_KEY)
    );

    // Create test memo data
    const memoData = JSON.stringify({
      type: 'VEEP_BATCH_TEST',
      batchId: 'test-batch-001',
      batchHash: 'a'.repeat(64),
      messageCount: 1000,
      timestamp: new Date().toISOString()
    });

    console.log('Memo data:', memoData);
    console.log('Size:', memoData.length, 'bytes');
    console.log('');

    // Create transaction
    const transaction = new Transaction();

    // Add transfer (to self, minimal)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1
      })
    );

    // Add memo
    transaction.add({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoData)
    });

    console.log('Sending transaction...');

    // Send
    const signature = await connection.sendTransaction(transaction, [wallet], {
      skipPreflight: false
    });

    console.log('Transaction sent! Signature:', signature);
    console.log('Waiting for confirmation...');

    // Confirm
    await connection.confirmTransaction(signature, 'confirmed');

    console.log('✅ Transaction confirmed!');
    console.log('');
    console.log('View on Solana Explorer:');
    const network = process.env.SOLANA_NETWORK || 'devnet';
    const clusterParam = network === 'mainnet' ? '' : `?cluster=${network}`;
    console.log(`https://explorer.solana.com/tx/${signature}${clusterParam}`);
    console.log('');

    // Verify
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed'
    });
    console.log('Transaction details:');
    console.log('- Block Time:', new Date(tx.blockTime * 1000).toISOString());
    console.log('- Slot:', tx.slot);
    console.log('- Fee:', tx.meta.fee, 'lamports');

    return signature;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

testTransaction();
