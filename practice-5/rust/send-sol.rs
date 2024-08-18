use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
    instruction::Instruction,
    commitment_config::CommitmentConfig,
};
use solana_sdk::message::Message;
use solana_sdk::signer::Signer as SolanaSigner;
use std::env;

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

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

    let recipient = Pubkey::from_str("6BNUJnyhtcJjDcwaGWZk25PX9x1rA7EMJXfveY7w3fr6")?;
    println!("💸 Attempting to send 0.01 SOL to {}...", recipient);

    let transfer_amount = (0.01 * LAMPORTS_PER_SOL as f64) as u64;

    let transfer_instruction = system_instruction::transfer(
        &sender.pubkey(),
        &recipient,
        transfer_amount,
    );

    let mut transaction = Transaction::new_with_payer(
        &[transfer_instruction],
        Some(&sender.pubkey()),
    );

    let recent_blockhash = connection.get_recent_blockhash().await?;
    transaction.sign(&[&sender], recent_blockhash);

    let signature = connection.send_and_confirm_transaction(&transaction).await?;
    println!("✅ Transaction confirmed, signature: {}!", signature);

    let memo_program = Pubkey::from_str("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")?;
    let memo_text = "Hello from Mykola Dzoban!";

    let memo_instruction = Instruction::new_with_bytes(
        memo_program,
        memo_text.as_bytes(),
        vec![sender.pubkey()],
    );

    transaction = Transaction::new_with_payer(
        &[memo_instruction],
        Some(&sender.pubkey()),
    );

    transaction.sign(&[&sender], recent_blockhash);

    let signature = connection.send_and_confirm_transaction(&transaction).await?;
    println!("📝 memo is: {}", memo_text);

    Ok(())
}
