const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const bs58 = require('bs58');
const logger = require('../utils/logger');

// Solana Memo Program ID (built-in program)
const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
);

/**
 * SolanaClient - Handles all interactions with Solana blockchain
 * 
 * Responsibilities:
 * - Manage wallet connection
 * - Create and send memo transactions
 * - Verify transactions on blockchain
 * - Monitor wallet balance and RPC health
 */
class SolanaClient {
  constructor(config) {
    this.config = config;
    this.connection = null;
    this.wallet = null;
    this.isHealthy = false;
    
    this.initialize();
  }

  /**
   * Initialize connection and load wallet
   */
  initialize() {
    try {
      // Create connection to Solana RPC
      this.connection = new Connection(
        this.config.rpcUrl,
        'confirmed' // Commitment level
      );
      
      // Load wallet from private key
      this.wallet = this.loadWallet();
      
      // Mark as healthy (will be verified in checkHealth)
      this.isHealthy = true;
      
      logger.info('SolanaClient initialized', {
        network: this.config.network,
        publicKey: this.wallet.publicKey.toBase58(),
        rpcUrl: this.config.rpcUrl
      });
    } catch (error) {
      logger.error('Failed to initialize SolanaClient', { error: error.message });
      this.isHealthy = false;
      throw error;
    }
  }

  /**
   * Load wallet from private key in environment variable
   * @returns {Keypair} Solana wallet keypair
   */
  loadWallet() {
    const privateKey = this.config.privateKey;
    
    if (!privateKey) {
      throw new Error('SOLANA_PRIVATE_KEY not configured');
    }

    try {
      // Decode base58 private key
      const privateKeyBytes = bs58.decode(privateKey);
      
      // Validate key length (should be 64 bytes)
      if (privateKeyBytes.length !== 64) {
        throw new Error(`Invalid private key length: ${privateKeyBytes.length} (expected 64)`);
      }
      
      // Create keypair
      const wallet = Keypair.fromSecretKey(privateKeyBytes);
      
      logger.info('Wallet loaded successfully', {
        publicKey: wallet.publicKey.toBase58()
      });
      
      return wallet;
    } catch (error) {
      logger.error('Failed to load wallet', { error: error.message });
      throw new Error(`Failed to load wallet: ${error.message}`);
    }
  }

  /**
   * Check health of Solana connection and wallet
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    try {
      // Check RPC connection
      const blockHeight = await this.connection.getBlockHeight();
      
      // Check wallet balance
      const balance = await this.getWalletBalance();
      
      // Determine balance status
      let balanceStatus = 'ok';
      if (balance < 0.05) {
        balanceStatus = 'critical';
      } else if (balance < 0.1) {
        balanceStatus = 'low';
      }
      
      this.isHealthy = true;
      
      return {
        healthy: true,
        rpc: {
          connected: true,
          blockHeight,
          url: this.config.rpcUrl
        },
        wallet: {
          publicKey: this.wallet.publicKey.toBase58(),
          balance,
          balanceStatus
        }
      };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      this.isHealthy = false;
      
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get wallet balance in SOL
   * @returns {Promise<number>} Balance in SOL
   */
  async getWalletBalance() {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Failed to get wallet balance', { error: error.message });
      throw error;
    }
  }

  /**
   * Record a batch to Solana blockchain using memo transaction
   * @param {Object} batch - Batch object with metadata
   * @param {string} batchHash - SHA-256 hash of the batch
   * @returns {Promise<Object>} Result with success status and signature
   */
  async recordBatch(batch, batchHash) {
    const startTime = Date.now();
    
    try {
      logger.info('Recording batch to Solana', {
        batchId: batch.batch_id,
        messageCount: batch.message_count
      });

      // Check if healthy
      if (!this.isHealthy) {
        return {
          success: false,
          error: 'SOLANA_UNHEALTHY',
          retryable: true
        };
      }

      // Create memo data (will be stored on blockchain)
      const memoData = this.createMemoData(batch, batchHash);
      
      // Validate memo size (max 566 bytes for Solana memo)
      if (memoData.length > 566) {
        logger.error('Memo data too large', { size: memoData.length });
        return {
          success: false,
          error: 'MEMO_TOO_LARGE',
          retryable: false
        };
      }

      // Create transaction
      const transaction = new Transaction();
      
      // Add minimal transfer (to self, 1 lamport)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: this.wallet.publicKey,
          lamports: 1
        })
      );
      
      // Add memo instruction
      transaction.add({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoData)
      });

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        {
          commitment: 'confirmed',
          maxRetries: 3,
          skipPreflight: false
        }
      );

      const duration = Date.now() - startTime;
      
      logger.info('Batch recorded successfully', {
        batchId: batch.batch_id,
        signature,
        duration: `${duration}ms`
      });

      return {
        success: true,
        signature,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to record batch', {
        batchId: batch.batch_id,
        error: error.message,
        duration: `${duration}ms`
      });

      // Categorize error
      const errorInfo = this.categorizeError(error);
      
      return {
        success: false,
        error: errorInfo.type,
        message: error.message,
        retryable: errorInfo.retryable,
        duration
      };
    }
  }

  /**
   * Create memo data for blockchain
   * @param {Object} batch - Batch object
   * @param {string} batchHash - Batch hash
   * @returns {string} JSON string for memo
   */
  createMemoData(batch, batchHash) {
    const memoData = {
      type: 'VEEP_BATCH',
      version: '1.0',
      batchId: batch.batch_id,
      batchHash: batchHash,
      messageCount: batch.message_count,
      startTimestamp: batch.start_timestamp,
      endTimestamp: batch.end_timestamp,
      timestamp: new Date().toISOString()
    };
    
    return JSON.stringify(memoData);
  }

  /**
   * Verify a batch on blockchain
   * @param {string} signature - Transaction signature
   * @returns {Promise<Object>} Verification result
   */
  async verifyBatch(signature) {
    try {
      logger.info('Verifying batch on blockchain', { signature });

      // Get transaction with base64 encoding (more reliable)
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!tx) {
        return {
          verified: false,
          error: 'Transaction not found',
          signature
        };
      }

      // Find memo instruction
      const memoInstruction = tx.transaction.message.instructions.find(
        (ix) => {
          // Check if this is a parsed instruction with program 'spl-memo'
          if (ix.program === 'spl-memo') {
            return true;
          }
          // Or check programId string
          if (ix.programId && ix.programId.toString() === MEMO_PROGRAM_ID.toString()) {
            return true;
          }
          return false;
        }
      );

      if (!memoInstruction) {
        return {
          verified: false,
          error: 'Memo instruction not found',
          signature
        };
      }

      // Parse memo data
      let memoData;
      try {
        // getParsedTransaction returns memo data in 'parsed' field for spl-memo program
        const memoText = memoInstruction.parsed;
        if (!memoText) {
          return {
            verified: false,
            error: 'Memo data not found in instruction',
            signature
          };
        }
        memoData = JSON.parse(memoText);
      } catch (parseError) {
        logger.error('Failed to parse memo', { 
          error: parseError.message
        });
        return {
          verified: false,
          error: 'Failed to parse memo data: ' + parseError.message,
          signature
        };
      }

      return {
        verified: true,
        signature,
        blockTime: tx.blockTime,
        slot: tx.slot,
        fee: tx.meta.fee,
        data: memoData,
        explorer: this.getExplorerUrl(signature)
      };
    } catch (error) {
      logger.error('Failed to verify batch', {
        signature,
        error: error.message
      });

      return {
        verified: false,
        error: error.message,
        signature
      };
    }
  }

  /**
   * Get Solana Explorer URL for transaction
   * @param {string} signature - Transaction signature
   * @returns {string} Explorer URL
   */
  getExplorerUrl(signature) {
    const cluster = this.config.network === 'mainnet' ? '' : `?cluster=${this.config.network}`;
    return `https://explorer.solana.com/tx/${signature}${cluster}`;
  }

  /**
   * Categorize error for retry logic
   * @param {Error} error - Error object
   * @returns {Object} Error category and retryable status
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    // Network/timeout errors - retryable
    if (message.includes('timeout') || message.includes('timed out')) {
      return { type: 'TIMEOUT', retryable: true };
    }
    
    if (message.includes('429') || message.includes('rate limit')) {
      return { type: 'RATE_LIMITED', retryable: true };
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return { type: 'NETWORK_ERROR', retryable: true };
    }
    
    if (message.includes('blockhash')) {
      return { type: 'BLOCKHASH_EXPIRED', retryable: true };
    }
    
    // Balance errors - not retryable
    if (message.includes('insufficient') || message.includes('balance')) {
      return { type: 'INSUFFICIENT_FUNDS', retryable: false };
    }
    
    // Transaction errors - not retryable
    if (message.includes('invalid') || message.includes('failed')) {
      return { type: 'INVALID_TRANSACTION', retryable: false };
    }
    
    // Default: retryable
    return { type: 'UNKNOWN_ERROR', retryable: true };
  }

  /**
   * Close connection (cleanup)
   */
  async close() {
    logger.info('Closing SolanaClient');
    this.isHealthy = false;
    // Connection cleanup happens automatically
  }
}

module.exports = SolanaClient;
