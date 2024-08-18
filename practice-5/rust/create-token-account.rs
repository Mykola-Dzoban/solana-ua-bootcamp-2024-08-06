use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
    commitment_config::CommitmentConfig,
};
use spl_associated_token_account::{get_associated_token_address, create_associated_token_account};
use spl_token::state::Mint;
use std::env;
use tokio;
use solana_sdk::instruction::Instruction;
use solana_sdk::program_pack::Pack;
use spl_token::instruction::initialize_mint;

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

    let token_mint_account = Pubkey::from_str("5QE5YAiBP362SjgYzBMWkVXU3a7jwVZrnPAcQ7LCSu7X")?;
    let recipient = Pubkey::from_str("VTRGtWre4ieP7FdKrXARJhTeKEmdH5Sq1rfdjZTCLwD")?;

    // Generate associated token account address
    let associated_token_account = get_associated_token_address(
        &recipient,
        &token_mint_account,
    );

    // Check if the associated token account already exists
    let mut transaction = Transaction::new_with_payer(
        &[],
        Some(&sender.pubkey()),
    );

    let recent_blockhash = connection.get_recent_blockhash().await?;
    transaction.sign(&[&sender], recent_blockhash);

    // Send a dummy transaction to verify existence (optional)
    let _signature = connection.send_and_confirm_transaction(&transaction).await?;
    
    // Create associated token account
    let create_associated_account_ix = create_associated_token_account(
        &sender.pubkey(),
        &recipient,
        &token_mint_account,
    );

    transaction = Transaction::new_with_payer(
        &[create_associated_account_ix],
        Some(&sender.pubkey()),
    );

    transaction.sign(&[&sender], recent_blockhash);

    let signature = connection.send_and_confirm_transaction(&transaction).await?;
    println!("✅ Created token account: https://explorer.solana.com/address/{}?cluster=devnet", associated_token_account);

    Ok(())
}
