use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
    commitment_config::CommitmentConfig,
    instruction::{Instruction},
};
use spl_token::state::Mint;
use std::env;
use tokio;
use serde_json::json;
use solana_sdk::program_error::ProgramError;
use solana_sdk::message::Message;
use solana_sdk::program_pack::Pack;
use metaplex_token_metadata::{
    instruction::create_metadata_account_v3,
    state::{Metadata, MetadataData},
};
use solana_program::program_pack::Pack as _;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    
    let private_key = env::var("SECRET_KEY")?;
    let private_key_bytes: Vec<u8> = serde_json::from_str(&private_key)?;
    let user = Keypair::from_bytes(&private_key_bytes)?;

    let connection = RpcClient::new_with_commitment(
        "https://api.devnet.solana.com".to_string(),
        CommitmentConfig::confirmed(),
    );

    println!("🔑 Our public key is: {}", user.pubkey());

    let token_metadata_program_id = Pubkey::from_str("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")?;
    let token_mint_account = Pubkey::from_str("E6pyfTsV6YhsTrKkA48w2pDQmVzRCRg2z6gFQSJDiZ5q")?;

    // Metadata data
    let metadata_data = MetadataData {
        name: "Solana UA Bootcamp 2024-08-06".to_string(),
        symbol: "UAB-2".to_string(),
        uri: "https://arweave.net/1234".to_string(),
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    let (metadata_pda, _metadata_bump) = Pubkey::find_program_address(
        &[
            b"metadata",
            token_metadata_program_id.as_ref(),
            token_mint_account.as_ref(),
        ],
        &token_metadata_program_id,
    );

    // Create metadata account instruction
    let create_metadata_account_ix = create_metadata_account_v3(
        &token_metadata_program_id,
        &metadata_pda,
        &token_mint_account,
        &user.pubkey(),
        &user.pubkey(),
        &user.pubkey(),
        metadata_data,
        true,
    )?;

    let mut transaction = Transaction::new_with_payer(
        &[create_metadata_account_ix],
        Some(&user.pubkey()),
    );

    let recent_blockhash = connection.get_recent_blockhash().await?;
    transaction.sign(&[&user], recent_blockhash);

    let signature = connection.send_and_confirm_transaction(&transaction).await?;
    let token_mint_link = format!(
        "https://explorer.solana.com/address/{}?cluster=devnet",
        token_mint_account
    );

    println!("✅ Look at the token mint again: {}", token_mint_link);

    Ok(())
}
