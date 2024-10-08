use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount, TransferChecked, transfer_checked, CloseAccount, close_account};
use anchor_spl::associated_token::AssociatedToken;
use crate::Offer;  // Ensure this path is correct

#[derive(Accounts)]
pub struct TakeOffer<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub token_mint_a: Account<'info, Mint>,

    pub token_mint_b: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = token_mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_token_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint_b,
        associated_token::authority = taker,
        associated_token::token_program = token_program,
    )]
    pub taker_token_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = token_mint_b,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_token_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        close = maker,
        has_one = maker,
        has_one = token_mint_a,
        has_one = token_mint_b,
        seeds = [b"offer", maker.key().as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump
    )]
    pub offer: Account<'info, Offer>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn send_wanted_tokens_to_maker(ctx: &Context<TakeOffer>) -> Result<()> {
    let transfer_accounts = TransferChecked {
        from: ctx.accounts.taker_token_account_b.to_account_info(),
        mint: ctx.accounts.token_mint_b.to_account_info(),
        to: ctx.accounts.maker_token_account_b.to_account_info(),
        authority: ctx.accounts.taker.to_account_info(),
    };

    let transfer_cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );

    transfer_checked(
        transfer_cpi_ctx,
        ctx.accounts.offer.token_b_wanted_amount,
        ctx.accounts.token_mint_b.decimals,
    )
}

pub fn withdraw_and_close_offer(ctx: Context<TakeOffer>) -> Result<()> {
    // Create long-lived variables for signers
    let maker_key = ctx.accounts.maker.key();
    let maker_key_ref = maker_key.as_ref();

    // Long-lived variables for signers
    let signer_seeds: &[&[&[u8]]] = &[
        &[
            b"offer",
            maker_key_ref,
            &ctx.accounts.offer.id.to_le_bytes(),
            &[ctx.accounts.offer.bump],
        ],
    ];

    // Use long-lived variables in CPI contexts
    let transfer_accounts = TransferChecked {
        from: ctx.accounts.maker_token_account_a.to_account_info(),
        mint: ctx.accounts.token_mint_a.to_account_info(),
        to: ctx.accounts.taker_token_account_b.to_account_info(),
        authority: ctx.accounts.offer.to_account_info(),
    };

    let transfer_cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds, // Correctly wrapped
    );

    transfer_checked(
        transfer_cpi_ctx,
        ctx.accounts.offer.token_b_wanted_amount,
        ctx.accounts.token_mint_a.decimals,
    )?;

    let close_accounts = CloseAccount {
        account: ctx.accounts.offer.to_account_info(),
        destination: ctx.accounts.maker.to_account_info(),
        authority: ctx.accounts.offer.to_account_info(),
    };

    let close_cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        close_accounts,
        signer_seeds, // Correctly wrapped
    );

    close_account(close_cpi_ctx)
}
