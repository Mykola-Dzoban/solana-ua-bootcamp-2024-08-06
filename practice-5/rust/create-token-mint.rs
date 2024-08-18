use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
    commitment_config::CommitmentConfig,
};
use spl_token::instruction::initialize_mint;
use std::env;
use tokio;

const TOKEN_DECIMALS: u8 = 2;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    
    let private_key = env::var("SECRET_KEY")?;
    let private_key_bytes: Vec<u8> = serde_json::from_str(&private_key)?;
    let sender = Keypair::from_bytes(&private_key_bytes)?;

    let connection = RpcClient::new_with_commitment(
        "https://api.devnet.solana.com".to_string(),
        CommitmentConfig::confirmed(),
    );

    println!("🔑 Our public key is: {}", sender.pubkey());

    let mint_keypair = Keypair::generate(&mut rand::thread_rng());
    let mint_pubkey = mint_keypair.pubkey();

    let initialize_mint_ix = initialize_mint(
        &spl_token::id(),
        &mint_pubkey,
        &sender.pubkey(),
        None,
        TOKEN_DECIMALS,
    )?;

    let mut transaction = Transaction::new_with_payer(
        &[initialize_mint_ix],
        Some(&sender.pubkey()),
    );

    let recent_blockhash = connection.get_recent_blockhash().await?;
    transaction.sign(&[&sender, &mint_keypair], recent_blockhash);

    let signature = connection.send_and_confirm_transaction(&transaction).await?;
    println!("✅ Token Mint: https://explorer.solana.com/address/{}?cluster=devnet", mint_pubkey);

    Ok(())
}
