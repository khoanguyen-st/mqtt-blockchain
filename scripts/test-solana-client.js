/**
 * Test script for SolanaClient
 * Usage: ./scripts/devnet.sh node scripts/test-solana-client.js
 */

const SolanaClient = require('../src/clients/solana');
const config = require('../src/config');

async function testSolanaClient() {
  console.log('='.repeat(60));
  console.log('Testing SolanaClient');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. Initialize client
    console.log('1️⃣  Initializing SolanaClient...');
    const solanaClient = new SolanaClient(config.solana);
    console.log('   ✅ Client initialized');
    console.log('');

    // 2. Check health
    console.log('2️⃣  Checking health...');
    const health = await solanaClient.checkHealth();
    console.log('   Status:', health.healthy ? '✅ Healthy' : '❌ Unhealthy');
    if (health.healthy) {
      console.log('   Public Key:', health.wallet.publicKey);
      console.log('   Balance:', health.wallet.balance, 'SOL');
      console.log('   Balance Status:', health.wallet.balanceStatus);
      console.log('   Block Height:', health.rpc.blockHeight);
    }
    console.log('');

    // 3. Get wallet balance
    console.log('3️⃣  Getting wallet balance...');
    const balance = await solanaClient.getWalletBalance();
    console.log('   Balance:', balance, 'SOL');
    console.log('');

    // 4. Create mock batch
    console.log('4️⃣  Creating mock batch...');
    const mockBatch = {
      batch_id: `test-${Date.now()}`,
      message_count: 1000,
      start_timestamp: new Date(Date.now() - 300000).toISOString(),
      end_timestamp: new Date().toISOString()
    };
    const mockHash = 'a'.repeat(64); // Mock SHA-256 hash
    console.log('   Batch ID:', mockBatch.batch_id);
    console.log('   Messages:', mockBatch.message_count);
    console.log('');

    // 5. Record batch to blockchain
    console.log('5️⃣  Recording batch to Solana...');
    const recordResult = await solanaClient.recordBatch(mockBatch, mockHash);
    
    if (recordResult.success) {
      console.log('   ✅ Success!');
      console.log('   Signature:', recordResult.signature);
      console.log('   Duration:', recordResult.duration, 'ms');
      console.log('   Explorer:', solanaClient.getExplorerUrl(recordResult.signature));
      console.log('');

      // 6. Verify batch on blockchain
      console.log('6️⃣  Verifying batch on blockchain...');
      console.log('   Waiting 3 seconds for confirmation...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const verifyResult = await solanaClient.verifyBatch(recordResult.signature);
      
      if (verifyResult.verified) {
        console.log('   ✅ Verified!');
        console.log('   Block Time:', new Date(verifyResult.blockTime * 1000).toISOString());
        console.log('   Slot:', verifyResult.slot);
        console.log('   Fee:', verifyResult.fee, 'lamports');
        console.log('   Data:', JSON.stringify(verifyResult.data, null, 2));
      } else {
        console.log('   ❌ Verification failed:', verifyResult.error);
      }
    } else {
      console.log('   ❌ Failed to record batch');
      console.log('   Error:', recordResult.error);
      console.log('   Message:', recordResult.message);
      console.log('   Retryable:', recordResult.retryable);
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSolanaClient();
