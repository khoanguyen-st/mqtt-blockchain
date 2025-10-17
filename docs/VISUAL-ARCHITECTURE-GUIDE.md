# VEEP Platform - Visual Architecture Guide

## Diagrams & Flow Charts for Technical Understanding

**Version**: 1.0  
**Date**: October 15, 2025  
**Companion to**: TECHNICAL-DEEP-DIVE.md

---

## Quick Reference Diagrams

### 1. System Architecture (High-Level)

```
┌─────────────────────────────────────────────────────────────────┐
│                         IoT DEVICES (46+)                       │
│  Energy Meters • LoRaWAN • GPS • Real-time Measurements        │
└───────────────────────┬─────────────────────────────────────────┘
                        │ LoRaWAN Protocol
                        │ 15-60 min intervals
┌───────────────────────▼─────────────────────────────────────────┐
│                   ACTILITY THINGPARK                            │
│  LoRaWAN Network Server • Device Management • Data Routing      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ MQTT Publish
                        │ QoS 1, JSON Format
┌───────────────────────▼─────────────────────────────────────────┐
│                      MQTT BROKER                                │
│  mosquitto://35.247.134.9:1883 • Topic: mqtt/things/+/+        │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Subscribe
                        │ Real-time Stream
┌───────────────────────▼─────────────────────────────────────────┐
│                   VEEP PLATFORM CORE                            │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│ │   Parser    │→ │   Asset     │→ │   Hash      │             │
│ │  LoRaWAN    │  │  Service    │  │  Generator  │             │
│ └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│ │   Redis     │→ │   Batch     │→ │  Blockchain │             │
│ │   Stream    │  │  Processor  │  │   Service   │             │
│ └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────┬────────────────────────────────┬─────────────────┘
              │                                │
              │ PostgreSQL                     │ Solana RPC
              ▼                                ▼
┌──────────────────────┐          ┌──────────────────────┐
│   DATABASE LAYER     │          │  BLOCKCHAIN LAYER    │
│  • Messages          │          │  • Immutable Ledger  │
│  • Batches           │          │  • Public Verify     │
│  • Asset Metadata    │          │  • Memo Storage      │
│  • Asset History     │          │  • 100+ Transactions │
└──────────────────────┘          └──────────────────────┘
```

---

### 2. Data Flow (Message Processing)

```
TIME: 0s                     IoT Device Sends LoRaWAN Message
      │                      ┌─────────────────────────────┐
      │                      │ DevEUI: 24E124468E392493    │
      │                      │ Payload: { energy: 100.5 }  │
      │                      │ GPS: 10.953521, 106.720474  │
      │                      └──────────────┬──────────────┘
      │                                     │
TIME: 2s                                    │ LoRaWAN Network
      │                                     ▼
      │                      ┌─────────────────────────────┐
      │                      │   MQTT Broker Receives      │
      │                      │   Topic: mqtt/things/...    │
      │                      └──────────────┬──────────────┘
      │                                     │
TIME: 2.01s                                 │ Subscribe Event
      │                                     ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ① PARSE                                   │
      │         │  • Extract DevEUI, GPS, payload            │
      │         │  • Parse LoRaWAN format                    │
      │         │  • Validate structure                      │
      │         │  Duration: ~50ms                           │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 2.06s                      │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ② ASSET UPSERT                            │
      │         │  • Check if asset exists (by DevEUI)       │
      │         │  • Create or update asset_metadata         │
      │         │  • Update GPS location                     │
      │         │  • Log to asset_history                    │
      │         │  Duration: ~100ms                          │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 2.16s                      │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ③ HASH MESSAGE                            │
      │         │  Input: message_id + topic + payload +     │
      │         │         timestamp + device_eui             │
      │         │  Output: SHA-256 hash (64 hex chars)       │
      │         │  Duration: ~5ms                            │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 2.165s                     │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ④ SAVE TO DATABASE                        │
      │         │  INSERT INTO messages (                    │
      │         │    message_id, topic, payload,             │
      │         │    message_hash, asset_id, ...             │
      │         │  )                                         │
      │         │  Duration: ~100ms                          │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 2.265s                     │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑤ PUSH TO REDIS STREAM                    │
      │         │  XADD mqtt:messages *                      │
      │         │    message_id {id}                         │
      │         │    message_hash {hash}                     │
      │         │  Duration: ~10ms                           │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 2.275s                     │ Wait for batch...
      │                          │ (9 more messages)
      │                          │
      .                          .
      .    [8 more messages]     .
      .                          .
      │                          │
TIME: 120s                       │ 10th message triggers batch
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑥ BATCH PROCESSOR                         │
      │         │  • Read 10 messages from stream            │
      │         │  • Collect asset IDs                       │
      │         │  • Calculate location summary              │
      │         │  Duration: ~20ms                           │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 120.02s                    │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑦ BUILD MERKLE TREE                       │
      │         │                                            │
      │         │         merkle_root                        │
      │         │            /    \                          │
      │         │       hash_AB   hash_CD                    │
      │         │        /  \      /  \                      │
      │         │      h_A h_B   h_C h_D ...                 │
      │         │                                            │
      │         │  Duration: ~20ms                           │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 120.04s                    │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑧ GENERATE BATCH HASH                     │
      │         │  Input: batch_id + count + merkle_root +   │
      │         │         timestamp                          │
      │         │  Output: SHA-256 hash                      │
      │         │  Duration: ~5ms                            │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 120.045s                   │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑨ SAVE BATCH TO DATABASE                  │
      │         │  INSERT INTO batches (                     │
      │         │    batch_id, batch_hash, merkle_root,      │
      │         │    message_count, asset_ids, ...           │
      │         │  )                                         │
      │         │  UPDATE messages SET batch_id = ...        │
      │         │  Duration: ~100ms                          │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 120.145s                   │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑩ CREATE SOLANA TRANSACTION               │
      │         │  • Build compact memo (379 bytes)          │
      │         │  • Add transfer instruction (1 lamport)    │
      │         │  • Add memo instruction                    │
      │         │  • Sign with wallet                        │
      │         │  Duration: ~10ms                           │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 120.155s                   │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑪ SUBMIT TO SOLANA                        │
      │         │  • Send to RPC node                        │
      │         │  • Wait for confirmation                   │
      │         │  • Get signature                           │
      │         │  Duration: ~1000-2000ms                    │
      │         └────────────────┬───────────────────────────┘
      │                          │
TIME: 122s                       │
      │                          ▼
      │         ┌────────────────────────────────────────────┐
      │         │  ⑫ UPDATE DATABASE                         │
      │         │  UPDATE batches SET                        │
      │         │    solana_signature = '...',               │
      │         │    solana_status = 'confirmed'             │
      │         │  Duration: ~50ms                           │
      │         └────────────────────────────────────────────┘
      │
TIME: 122.05s  ✅ COMPLETE - Message on Blockchain!
```

---

### 3. Hashing Process (Detailed)

```
MESSAGE DATA
┌─────────────────────────────────────────────────────────┐
│ message_id: "abc-123-def-456"                          │
│ topic: "mqtt/things/24E124468E392493/uplink"           │
│ payload: {"DevEUI_uplink":{"DevEUI":"24E124468E392493",│
│           "FPort":85, "payload_hex":"ff190f0485963b"}} │
│ timestamp: "2025-10-15T10:00:00.000Z"                  │
│ device_eui: "24E124468E392493"                         │
└─────────────────────────────────────────────────────────┘
                        │
                        │ Concatenate with delimiter
                        ▼
┌─────────────────────────────────────────────────────────┐
│ INPUT STRING (for SHA-256)                             │
│                                                         │
│ "abc-123-def-456|mqtt/things/24E124468E392493/uplink|  │
│  {\"DevEUI_uplink\":{...}}|2025-10-15T10:00:00.000Z|   │
│  24E124468E392493"                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        │ SHA-256 Algorithm
                        │ (Cryptographic Hash Function)
                        ▼
┌─────────────────────────────────────────────────────────┐
│ MESSAGE HASH (64 hex characters = 256 bits)            │
│                                                         │
│ 7d8a4c5e9f2b1a3c6d8e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c │
│ 6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1 │
│                                                         │
│ Properties:                                             │
│ ✅ Deterministic (same input → same output)            │
│ ✅ Unique (different input → different output)         │
│ ✅ One-way (cannot reverse)                            │
│ ✅ Fixed-length (always 64 hex chars)                  │
│ ✅ Collision-resistant                                 │
└─────────────────────────────────────────────────────────┘
                        │
                        │ Store in database
                        ▼
┌─────────────────────────────────────────────────────────┐
│ DATABASE: messages table                                │
│ ┌───────────┬──────────┬──────────┬───────────────────┐│
│ │message_id │  topic   │ payload  │   message_hash    ││
│ ├───────────┼──────────┼──────────┼───────────────────┤│
│ │ abc-123.. │ mqtt/... │ {...}    │ 7d8a4c5e9f2b1a... ││
│ └───────────┴──────────┴──────────┴───────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

### 4. Merkle Tree Construction (Visual)

```
BUILDING MERKLE TREE FOR 10 MESSAGES

Step 1: Collect Message Hashes (Level 0 - Leaf Nodes)
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ hash_1 │ hash_2 │ hash_3 │ hash_4 │ hash_5 │ hash_6 │ hash_7 │ hash_8 │ hash_9 │hash_10 │
│ 7d8a4c │ 3f1a2b │ a5c6e8 │ 1b3d5f │ 9e2f3a │ 6d8e0f │ 2b4c6d │ 8f9a0b │ 4d5e6f │ 0a1b2c │
└───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┘
    │        │        │        │        │        │        │        │        │        │
    └────┬───┘        └────┬───┘        └────┬───┘        └────┬───┘        └────┬───┘
         │                 │                 │                 │                 │
         │ SHA-256(h1+h2)  │ SHA-256(h3+h4)  │ SHA-256(h5+h6)  │ SHA-256(h7+h8)  │ SHA-256(h9+h10)
         ▼                 ▼                 ▼                 ▼                 ▼

Step 2: Hash Pairs to Create Level 1
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│   hash_AB    │   hash_CD    │   hash_EF    │   hash_GH    │   hash_IJ    │
│   c4d5e6f7   │   7a8b9c0d   │   1e2f3a4b   │   5c6d7e8f   │   9a0b1c2d   │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │              │
       └──────┬───────┘              └──────┬───────┘              │
              │                             │                      │
              │ SHA-256(AB+CD)              │ SHA-256(EF+GH)       │
              ▼                             ▼                      ▼

Step 3: Hash Pairs to Create Level 2
┌─────────────────────┬─────────────────────┬─────────────────────┐
│     hash_ABCD       │     hash_EFGH       │     hash_IJ         │
│     3e4f5a6b7c8d    │     9d0e1f2a3b4c    │     9a0b1c2d        │
└──────────┬──────────┴──────────┬──────────┴──────────┬──────────┘
           │                     │                      │
           └──────────┬──────────┘                      │
                      │                                 │
                      │ SHA-256(ABCD+EFGH)              │
                      ▼                                 ▼

Step 4: Continue Until Single Root
┌─────────────────────────────────┬─────────────────────┐
│         hash_ABCDEFGH           │     hash_IJ         │
│         5d6e7f8a9b0c            │     9a0b1c2d        │
└──────────────┬──────────────────┴──────────┬──────────┘
               │                             │
               └──────────────┬──────────────┘
                              │
                              │ SHA-256(ABCDEFGH+IJ)
                              ▼

Step 5: Merkle Root (Level 3)
┌─────────────────────────────────────────────────────────┐
│                    MERKLE ROOT                          │
│         9e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d           │
│                                                         │
│ This single hash represents ALL 10 messages!            │
│ Any change to ANY message will change this root.        │
└─────────────────────────────────────────────────────────┘
```

---

### 5. Merkle Proof Verification

```
PROVING MESSAGE #3 IS IN THE BATCH

Given:
• Message hash: a5c6e8f0... (hash_3)
• Merkle root: 9e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d (from batch)

Proof Path (only 4 hashes needed to prove 1 of 10 messages!):
┌─────────────────────────────────────────────────────────┐
│ Step 1: Get sibling of hash_3                          │
│   Sibling: hash_4 (1b3d5f...)                          │
│   Position: RIGHT                                       │
│   Compute: SHA-256(hash_3 + hash_4) = hash_CD          │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: Get sibling of hash_CD                         │
│   Sibling: hash_AB (c4d5e6...)                         │
│   Position: LEFT                                        │
│   Compute: SHA-256(hash_AB + hash_CD) = hash_ABCD      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: Get sibling of hash_ABCD                       │
│   Sibling: hash_EFGH (9d0e1f...)                       │
│   Position: RIGHT                                       │
│   Compute: SHA-256(hash_ABCD + hash_EFGH) = hash_...   │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: Get sibling of hash_ABCDEFGH                   │
│   Sibling: hash_IJ (9a0b1c...)                         │
│   Position: RIGHT                                       │
│   Compute: SHA-256(hash_ABCDEFGH + hash_IJ) = ROOT     │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ Step 5: Compare computed root with stored root         │
│   Computed: 9e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d      │
│   Stored:   9e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d      │
│   Match: ✅ YES → Message #3 is verified!              │
└─────────────────────────────────────────────────────────┘

Proof Size Comparison:
• Full batch: 10 message hashes × 64 bytes = 640 bytes
• Merkle proof: 4 sibling hashes × 64 bytes = 256 bytes
• Savings: 60% smaller proof!
• For 1000 messages: Full = 64KB, Proof = 640 bytes (99% savings!)
```

---

### 6. Solana Transaction Structure

```
SOLANA TRANSACTION ANATOMY

┌─────────────────────────────────────────────────────────┐
│                  TRANSACTION METADATA                   │
├─────────────────────────────────────────────────────────┤
│ Signature: SH1wZaVvyo1tTyfdnK3rMAH8hRAPDW8hqibMWNc... │
│ Block Time: 2025-10-15T10:05:01Z                       │
│ Slot: 12345678                                         │
│ Fee: 5000 lamports ($0.00025)                          │
│ Status: Success ✅                                      │
└─────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│  INSTRUCTION 1   │          │  INSTRUCTION 2   │
│   (Transfer)     │          │     (Memo)       │
├──────────────────┤          ├──────────────────┤
│ Program:         │          │ Program:         │
│  System          │          │  Memo            │
│                  │          │  (MemoSq4gq...)  │
│ From:            │          │                  │
│  HgMJvtdEaht... │          │ Data:            │
│                  │          │  {               │
│ To:              │          │    "t":"VEEP",   │
│  HgMJvtdEaht... │          │    "v":"2.0",    │
│  (self)          │          │    "bid":"...",  │
│                  │          │    "h":"...",    │
│ Amount:          │          │    "mc":10,      │
│  1 lamport       │          │    ...           │
│  ($0.0000005)    │          │  }               │
└──────────────────┘          │                  │
                              │ Size: 379 bytes  │
                              └──────────────────┘
```

---

### 7. Compact Memo Format

```
BEFORE OPTIMIZATION (586 bytes - TOO LARGE ❌)
{
  "type": "VERIOT_BATCH",
  "version": "2.0",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "batchHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6...",
  "messageCount": 10,
  "startTimestamp": "2025-10-15T10:00:00.000Z",
  "endTimestamp": "2025-10-15T10:05:00.000Z",
  "timestamp": "2025-10-15T10:05:01.000Z",
  "asset": {
    "assetIds": ["uuid1", "uuid2", "uuid3", "uuid4", "uuid5"],
    "assetTypes": ["ENERGY_METER", "ENERGY_METER"],
    "sites": ["Nedspice", "McDonalds", "Bitexco"],
    "locationSummary": {
      "centroid": {
        "latitude": 10.953521234,
        "longitude": 106.720474567
      },
      "assetCount": 5
    }
  },
  "owner": {
    "walletAddress": "HgMJvtdEahtFwDX8pqFWYAegNST27xKmDDAUsSEhGBKa",
    "issuer": "VEEP Vietnam",
    "network": "devnet"
  },
  "verificationUrl": "https://veep.com/verify/550e8400-..."
}

        │ OPTIMIZATION APPLIED
        │ • Short keys
        │ • Unix timestamps
        │ • Limited arrays
        │ • Removed fields
        ▼

AFTER OPTIMIZATION (379 bytes - FITS ✅)
{
  "t":"VERIOT_BATCH",
  "v":"2.0",
  "bid":"550e8400-e29b-41d4-a716-446655440000",
  "h":"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6...",
  "mc":10,
  "ts":1729000000,
  "s":1728999700,
  "e":1729000000,
  "a":{
    "ids":["uuid1","uuid2","uuid3"],
    "typ":["ENERGY_METER"],
    "sit":["Nedspice","McDonalds"],
    "loc":{"lat":10.953521,"lon":106.720474,"cnt":5}
  },
  "o":{"w":"HgMJvtdEahtFwDX8pqFWYAegNST27xKmDDAUsSEhGBKa","n":"devnet"}
}

SAVINGS: 207 bytes (35.3%)
MARGIN: 187 bytes remaining (33% buffer)
```

---

### 8. Data Integrity Layers

```
┌─────────────────────────────────────────────────────────┐
│ LAYER 5: PUBLIC BLOCKCHAIN (Immutable)                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Solana Ledger                                       │ │
│ │ • Transaction: SH1wZaVvyo...                        │ │
│ │ • Memo: {"t":"VERIOT_BATCH","h":"a1b2c3d4...",...}   │ │
│ │ • Block: 12345678                                   │ │
│ │ • Status: Finalized                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│ Properties: Cannot modify, Public verify, Permanent     │
└────────────────────────┬────────────────────────────────┘
                         │ References & Verifies
┌────────────────────────▼────────────────────────────────┐
│ LAYER 4: BATCH HASH                                     │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ batch_hash = SHA-256(                               │ │
│ │   batch_id +                                        │ │
│ │   message_count +                                   │ │
│ │   merkle_root +                                     │ │
│ │   timestamp                                         │ │
│ │ )                                                   │ │
│ └─────────────────────────────────────────────────────┘ │
│ Properties: Unique fingerprint, Tamper detection        │
└────────────────────────┬────────────────────────────────┘
                         │ Computed from
┌────────────────────────▼────────────────────────────────┐
│ LAYER 3: MERKLE ROOT                                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                  merkle_root                        │ │
│ │                     /    \                          │ │
│ │                hash_AB   hash_CD                    │ │
│ │                 /  \      /  \                      │ │
│ │               h_A h_B   h_C h_D                     │ │
│ └─────────────────────────────────────────────────────┘ │
│ Properties: Efficient proof, Batch integrity            │
└────────────────────────┬────────────────────────────────┘
                         │ Built from
┌────────────────────────▼────────────────────────────────┐
│ LAYER 2: MESSAGE HASHES                                 │
│ ┌───────────┬───────────┬───────────┬───────────┐      │
│ │  hash_1   │  hash_2   │  hash_3   │  hash_4   │ ...  │
│ │ 7d8a4c... │ 3f1a2b... │ a5c6e8... │ 1b3d5f... │      │
│ └───────────┴───────────┴───────────┴───────────┘      │
│ Properties: Individual fingerprints, Change detection   │
└────────────────────────┬────────────────────────────────┘
                         │ Computed from
┌────────────────────────▼────────────────────────────────┐
│ LAYER 1: ORIGINAL IoT DATA                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Message 1: {DevEUI:"...", payload:{energy:100.5}}   │ │
│ │ Message 2: {DevEUI:"...", payload:{energy:95.2}}    │ │
│ │ Message 3: {DevEUI:"...", payload:{energy:103.7}}   │ │
│ │ ...                                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│ Properties: Raw data, Timestamped, Stored in PostgreSQL │
└─────────────────────────────────────────────────────────┘

VERIFICATION PATH:
User wants to verify Message #2 is authentic:

1. Get message from DB → Check hash matches
2. Get Merkle proof → Verify path to root
3. Get batch from DB → Check root matches
4. Get blockchain tx → Check hash matches
5. ✅ Verified! Message is authentic and unmodified
```

---

### 9. Security Model

```
THREAT MODEL & MITIGATIONS

┌─────────────────────────────────────────────────────────┐
│ ATTACK VECTOR 1: Data Tampering                        │
├─────────────────────────────────────────────────────────┤
│ Scenario: Attacker modifies message payload in DB      │
│                                                         │
│ Original:  {energy: 100.5} → hash: 7d8a4c...           │
│ Tampered:  {energy: 200.5} → hash: 9f1b2e... (diff!)   │
│                                                         │
│ Detection:                                              │
│   ✅ Hash mismatch                                      │
│   ✅ Merkle proof fails                                 │
│   ✅ Blockchain verification fails                      │
│                                                         │
│ Mitigation: Regular integrity audits, Alerts           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ATTACK VECTOR 2: Replay Attack                         │
├─────────────────────────────────────────────────────────┤
│ Scenario: Attacker captures transaction, tries replay  │
│                                                         │
│ Original TX: Sent at block 12345678                    │
│ Replay TX:   Attempted at block 12345999               │
│                                                         │
│ Detection:                                              │
│   ✅ Solana recentBlockhash expired (~60 seconds)      │
│   ✅ Transaction rejected by network                    │
│   ✅ Unique batch_id prevents duplicates               │
│                                                         │
│ Mitigation: Solana built-in protection                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ATTACK VECTOR 3: Man-in-the-Middle                     │
├─────────────────────────────────────────────────────────┤
│ Scenario: Attacker intercepts MQTT or RPC traffic      │
│                                                         │
│ Device → [ATTACKER] → MQTT Broker                      │
│ App    → [ATTACKER] → Solana RPC                       │
│                                                         │
│ Detection & Prevention:                                 │
│   ✅ TLS encryption (HTTPS, MQTTS)                     │
│   ✅ Message signing with private keys                 │
│   ✅ Certificate validation                             │
│                                                         │
│ Mitigation: End-to-end encryption, PKI                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ATTACK VECTOR 4: Wallet Compromise                     │
├─────────────────────────────────────────────────────────┤
│ Scenario: Attacker gains access to private key         │
│                                                         │
│ Impact:                                                 │
│   • Can create fake transactions                       │
│   • Can drain wallet funds                             │
│   • Cannot modify past blockchain records              │
│                                                         │
│ Prevention:                                             │
│   ✅ Hardware wallet for production                    │
│   ✅ Multi-sig for high-value operations               │
│   ✅ Key rotation policy                               │
│   ✅ Secrets manager (not env files)                   │
│   ✅ Balance monitoring & alerts                       │
│                                                         │
│ Mitigation: Defense in depth                           │
└─────────────────────────────────────────────────────────┘
```

---

### 10. Performance Characteristics

```
SYSTEM PERFORMANCE METRICS

Throughput:
┌─────────────────────────────────────────────────────────┐
│ Messages per Second                                     │
│ ████████████████████░░░░░░░░░ 50 msgs/sec (current)    │
│ ██████████████████████████████ 100 msgs/sec (target)   │
│                                                         │
│ Batches per Hour                                        │
│ ████████████████████████░░░░░ 300 batches/hour         │
│                                                         │
│ Blockchain Transactions per Day                         │
│ ████████████████████░░░░░░░░░ 250 txs/day             │
└─────────────────────────────────────────────────────────┘

Latency Breakdown:
┌─────────────────────────────────────────────────────────┐
│ Component               │ Latency    │ % of Total      │
├─────────────────────────┼────────────┼─────────────────┤
│ IoT → MQTT              │ 2-5s       │ 50-80%          │
│ MQTT → App              │ <10ms      │ <1%             │
│ Parse + Hash            │ 50-60ms    │ 1-2%            │
│ Database Save           │ 100-150ms  │ 3-5%            │
│ Redis Push              │ 10ms       │ <1%             │
│ Batch Processing        │ 20-50ms    │ 1-2%            │
│ Merkle Tree Build       │ 20ms       │ <1%             │
│ Solana Submit           │ 1000-2000ms│ 20-40%          │
│ ─────────────────────── │ ────────── │ ─────────────── │
│ TOTAL                   │ 4-8s       │ 100%            │
└─────────────────────────┴────────────┴─────────────────┘

Cost Analysis (per 1000 messages):
┌─────────────────────────────────────────────────────────┐
│ Item                    │ Quantity   │ Cost            │
├─────────────────────────┼────────────┼─────────────────┤
│ LoRaWAN transmission    │ 1000 msgs  │ $0 (prepaid)    │
│ MQTT broker             │ 1000 msgs  │ $0 (self-hosted)│
│ Database storage        │ ~1 MB      │ <$0.001         │
│ Redis cache             │ ~100 KB    │ <$0.0001        │
│ Blockchain txs          │ 100 batches│ $0.025          │
│ ─────────────────────── │ ────────── │ ─────────────── │
│ TOTAL                   │            │ ~$0.026         │
└─────────────────────────┴────────────┴─────────────────┘
```

---

## Summary

This visual guide complements the TECHNICAL-DEEP-DIVE.md document with:

✅ **System architecture** diagrams  
✅ **Data flow** step-by-step visualization  
✅ **Hashing process** detailed breakdown  
✅ **Merkle tree** construction and proof  
✅ **Solana transaction** structure  
✅ **Security model** threat analysis  
✅ **Performance metrics** and costs

Use these diagrams in:

- Technical presentations
- Architecture reviews
- Security audits
- Training materials
- Documentation

---

**For questions or clarifications, refer to**: TECHNICAL-DEEP-DIVE.md  
**Version**: 1.0 | **Date**: October 15, 2025
