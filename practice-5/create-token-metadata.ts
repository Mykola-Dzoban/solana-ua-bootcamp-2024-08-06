import "dotenv/config";
import {
  Connection, clusterApiUrl, Keypair, PublicKey, sendAndConfirmTransaction, Transaction,
} from "@solana/web3.js";
import { getExplorerLink } from "@solana-developers/helpers";
// Yes, createCreate! We're making an instruction for createMetadataV3...
import { createCreateMetadataAccountV3Instruction } from "@metaplex-foundation/mpl-token-metadata";
import { createMultisig } from "@solana/spl-token";

let privateKey = process.env["SECRET_KEY"];
if (privateKey === undefined) {
  console.log("Add SECRET_KEY to .env!");
  process.exit(1);
}
const asArray = Uint8Array.from(JSON.parse(privateKey));
const user = Keypair.fromSecretKey(asArray);

const connection = new Connection(clusterApiUrl("devnet"));
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const tokenMintAccount = new PublicKey(
  "BZo6hwTPBDuZvbwfBgi8ruQKkC8vLSocAhSpgSeZ7Vka"
);

const metadataData = {
  name: "Solana UA Bootcamp 2024-08-06 MD",
  symbol: "UAB-2",
  // Arweave / IPFS / Pinata etc link using metaplex standard for off-chain data
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
  [
    user.publicKey,
  ],
  2
);

console.log(`Created 1/3 multisig ${multisigKey.toBase58()}`);