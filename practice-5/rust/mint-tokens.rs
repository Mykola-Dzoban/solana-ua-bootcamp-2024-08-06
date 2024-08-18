use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
    commitment_config::CommitmentConfig,
};
use spl_token::instruction::mint_to;
use std::env;
use tokio;
use solana_sdk::program_error::ProgramError;
use solana_sdk::instruction::Instruction;
use solana_sdk::message::Message;
use solana_sdk::transaction::TransactionError;

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
    let recipient_associated_token_account = Pubkey::from_str("GkcaRYujNRz2ybDpWcmLa2DAnGpEKDfn2M7rpCcuyXD6")?;

    // Our token has two decimal places
    let minor_units_per_major_units = 10u64.pow(2);

    let amount_to_mint = 10 * minor_units_per_major_units;

    let mint_to_ix = mint_to(
        &spl_token::id(),
        &token_mint_account,
        &recipient_associated_token_account,
        &sender.pubkey(),
        &[],
        amount_to_mint,
    )?;

    let mut transaction = Transaction::new_with_payer(
        &[mint_to_ix],
        Some(&sender.pubkey()),
    );

    let recent_blockhash = connection.get_recent_blockhash().await?;
    transaction.sign(&[&sender], recent_blockhash);

    let signature = connection.send_and_confirm_transaction(&transaction).await?;
    println!("✅ Success! Mint Token Transaction: https://explorer.solana.com/transaction/{}?cluster=devnet", signature);

    Ok(())
}
