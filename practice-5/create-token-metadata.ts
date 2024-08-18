import "dotenv/config";
import {
  Connection, clusterApiUrl, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
  TransactionInstruction, LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { getExplorerLink } from "@solana-developers/helpers";
import { createCreateMetadataAccountV3Instruction } from "@metaplex-foundation/mpl-token-metadata";
import { createMultisig } from "@solana/spl-token";

// Load environment variables
let privateKey = process.env["SECRET_KEY"];
if (privateKey === undefined) {
  console.log("Add SECRET_KEY to .env!");
  process.exit(1);
}
const asArray = Uint8Array.from(JSON.parse(privateKey));
const user = Keypair.fromSecretKey(asArray);

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const tokenMintAccount = new PublicKey(
  "ASraEcnwp6nruMyFTAa3LwTCYR6i3dsDrsf4Xq22J5Xc"
);

const metadataData = {
  name: "Solana UA Bootcamp 2024-08-06 MD",
  symbol: "UAB-2",
  uri: "https://arweave.net/1234",
  sellerFeeBasisPoints: 0,
  creators: null,
  collection: null,
  uses: null,
};
const [metadataPDA, _metadataBump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("metadata"),
    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
    tokenMintAccount.toBuffer(),
  ],
  TOKEN_METADATA_PROGRAM_ID
);

// Create a new nonce account
const nonceAccount = Keypair.generate();
const nonceAccountPublicKey = nonceAccount.publicKey;

console.log(`Generated Nonce Account PublicKey: ${nonceAccountPublicKey.toBase58()}`);

// Fund the nonce account
const lamports = await connection.getMinimumBalanceForRentExemption(128);
console.log(`Minimum balance required for nonce account: ${lamports} lamports`);

// Create nonce account instruction
const createNonceAccountInstruction = SystemProgram.createAccount({
  fromPubkey: user.publicKey,
  newAccountPubkey: nonceAccountPublicKey,
  lamports: lamports,
  space: 256, // space required for nonce account; usually 256 bytes
  programId: SystemProgram.programId,
});

// Initialize the nonce account
const initializeNonceAccountInstruction = new TransactionInstruction({
  keys: [
    { pubkey: nonceAccountPublicKey, isSigner: false, isWritable: true },
    { pubkey: user.publicKey, isSigner: true, isWritable: false },
  ],
  programId: SystemProgram.programId,
  data: Buffer.from([0]), // 0 for nonce initialization
});

console.log(`Created nonce account instructions`);

// Create transaction for metadata account creation
const transaction = new Transaction().add(
  createNonceAccountInstruction,
  initializeNonceAccountInstruction
);

const createMetadataAccountInstruction = createCreateMetadataAccountV3Instruction(
  {
    metadata: metadataPDA,
    mint: tokenMintAccount,
    mintAuthority: user.publicKey,
    payer: user.publicKey,
    updateAuthority: user.publicKey,
  },
  {
    createMetadataAccountArgsV3: {
      collectionDetails: null,
      data: metadataData,
      isMutable: true,
    },
  }
);
transaction.add(createMetadataAccountInstruction);

console.log(`Added metadata creation instruction to transaction`);

// Set recent blockhash and fee payer
transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
transaction.feePayer = user.publicKey;

console.log(`Transaction setup complete. Sending transaction...`);

// Send transaction
try {
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [user, nonceAccount]
  );
} catch (error) {
  console.error(`Transaction failed: ${error}`);
}

const tokenMintLink = getExplorerLink(
  "address",
  tokenMintAccount.toString(),
  "devnet"
);
console.log(`✅ Look at the token mint again: ${tokenMintLink}`);

try {
  const multisigKey = await createMultisig(
    connection,
    user,
    [user.publicKey],
    2
  );
  console.log(`Created 1/3 multisig ${multisigKey.toBase58()}`);
} catch (error) {
  console.error(`Failed to create multisig: ${error}`);
}
