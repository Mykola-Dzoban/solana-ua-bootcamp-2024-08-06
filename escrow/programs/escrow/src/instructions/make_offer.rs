use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount, ApproveChecked, approve_checked};
use anchor_spl::associated_token::AssociatedToken;
use crate::Offer;  // Ensure this path is correct

const ACCOUNT_DISCRIMINATOR: usize = 8;
const OFFER_SPACE: usize = ACCOUNT_DISCRIMINATOR + std::mem::size_of::<Offer>();

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct MakeOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub token_mint_a: Account<'info, Mint>,

    #[account(mint::token_program = token_program)]
    pub token_mint_b: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = token_mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program
    )]
    pub maker_token_account_a: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = maker,
        space = OFFER_SPACE,
        seeds = [b"offer", maker.key().as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn send_offered_tokens_to_vault(
    context: &Context<MakeOffer>,
    token_a_offered_amount: u64,
) -> Result<()> {
    let approve_accounts = ApproveChecked {
        to: context.accounts.offer.to_account_info(),
        mint: context.accounts.token_mint_a.to_account_info(),
        delegate: context.accounts.offer.to_account_info(),
        authority: context.accounts.maker.to_account_info(),
    };

    let cpi_context = CpiContext::new(
        context.accounts.token_program.to_account_info(),
        approve_accounts,
    );

    approve_checked(
        cpi_context,
        token_a_offered_amount,
        context.accounts.token_mint_a.decimals,
    )
}

pub fn save_offer(context: Context<MakeOffer>, id: u64, token_b_wanted_amount: u64) -> Result<()> {
    context.accounts.offer.set_inner(Offer {
        id,
        maker: context.accounts.maker.key(),
        token_mint_a: context.accounts.token_mint_a.key(),
        token_mint_b: context.accounts.token_mint_b.key(),
        token_b_wanted_amount,
        bump: context.bumps.offer,
    });
    Ok(())
}
