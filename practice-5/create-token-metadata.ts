import "dotenv/config";
import {
  Connection, clusterApiUrl, Keypair, PublicKey, sendAndConfirmTransaction, Transaction,
  SystemProgram
} from "@solana/web3.js";
import { getExplorerLink } from "@solana-developers/helpers";
import { createCreateMetadataAccountV3Instruction } from "@metaplex-foundation/mpl-token-metadata";
import { createMultisig } from "@solana/spl-token";

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
  "133AGCG8kkbXjproN4Smu35fRymxS5XbxP9iUjQhEioL"
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

// Create transaction for metadata account creation
const transaction = new Transaction();
const createMetadataAccountInstruction =
  createCreateMetadataAccountV3Instruction(
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

// Create an instruction to delegate transaction fees to the receiver
const receiverPublicKey = new PublicKey("6BNUJnyhtcJjDcwaGWZk25PX9x1rA7EMJXfveY7w3fr6"); // Replace with the actual receiver's public key
const transferInstruction = SystemProgram.transfer({
  fromPubkey: user.publicKey,
  toPubkey: receiverPublicKey,
  lamports: await connection.getMinimumBalanceForRentExemption(1) 
});
transaction.add(transferInstruction);

console.log(`Created instruction to delegate transaction fees to ${receiverPublicKey}`);

// Send transaction
await sendAndConfirmTransaction(
  connection,
  transaction,
  [user]
);

const tokenMintLink = getExplorerLink(
  "address",
  tokenMintAccount.toString(),
  "devnet"
);
console.log(`✅ Look at the token mint again: ${tokenMintLink}`);

const multisigKey = await createMultisig(
  connection,
  user,
  [user.publicKey],
  2
);

console.log(`Created 1/3 multisig ${multisigKey.toBase58()}`);
