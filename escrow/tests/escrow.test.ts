import { expect, describe, beforeAll, test } from '@jest/globals';
import * as anchor from '@coral-xyz/anchor';
import { type Program, BN } from '@coral-xyz/anchor';
import { Escrow } from '../target/types/escrow';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
	MINT_SIZE,
	TOKEN_PROGRAM_ID,
	createAssociatedTokenAccountIdempotentInstruction,
	createInitializeMint2Instruction,
	createMintToInstruction,
	createApproveCheckedInstruction,
	getAssociatedTokenAddressSync,
	getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { randomBytes } from 'crypto';
import { confirmTransaction, makeKeypairs } from '@solana-developers/helpers';

export const getRandomBigNumber = (size: number = 8) => {
	return new BN(randomBytes(size));
};

function areBnEqual(a: unknown, b: unknown): boolean | undefined {
	const isABn = a instanceof BN;
	const isBBn = b instanceof BN;

	if (isABn && isBBn) {
		return a.eq(b);
	} else if (isABn === isBBn) {
		return undefined;
	} else {
		return false;
	}
}
expect.addEqualityTesters([areBnEqual]);

const createTokenAndMintTo = async (
	connection: Connection,
	payer: PublicKey,
	tokenMint: PublicKey,
	decimals: number,
	mintAuthority: PublicKey,
	mintTo: Array<{ recipient: PublicKey; amount: number }>
): Promise<Array<TransactionInstruction>> => {
	const minimumLamports = await getMinimumBalanceForRentExemptMint(connection);

	const createTokenIxs = [
		SystemProgram.createAccount({
			fromPubkey: payer,
			newAccountPubkey: tokenMint,
			lamports: minimumLamports,
			space: MINT_SIZE,
			programId: TOKEN_PROGRAM_ID,
		}),
		createInitializeMint2Instruction(tokenMint, decimals, mintAuthority, null, TOKEN_PROGRAM_ID),
	];

	const mintToIxs = mintTo.flatMap(({ recipient, amount }) => {
		const ataAddress = getAssociatedTokenAddressSync(tokenMint, recipient, false, TOKEN_PROGRAM_ID);

		return [
			createAssociatedTokenAccountIdempotentInstruction(payer, ataAddress, recipient, tokenMint, TOKEN_PROGRAM_ID),
			createMintToInstruction(tokenMint, ataAddress, mintAuthority, amount, [], TOKEN_PROGRAM_ID),
		];
	});

	return [...createTokenIxs, ...mintToIxs];
};

const getTokenBalanceOn =
	(connection: Connection) =>
	async (tokenAccountAddress: PublicKey): Promise<BN> => {
		const tokenBalance = await connection.getTokenAccountBalance(tokenAccountAddress);
		return new BN(tokenBalance.value.amount);
	};

describe('escrow', () => {
	anchor.setProvider(anchor.AnchorProvider.env());

	const provider = anchor.getProvider();
	const connection = provider.connection;

	const program = anchor.workspace.Escrow as Program<Escrow>;

	const [alice, bob, usdcMint, wifMint] = makeKeypairs(4);

	const [aliceUsdcAccount, aliceWifAccount, bobUsdcAccount, bobWifAccount] = [alice, bob].flatMap((owner) =>
		[usdcMint, wifMint].map((tokenMint) => getAssociatedTokenAddressSync(tokenMint.publicKey, owner.publicKey, false, TOKEN_PROGRAM_ID))
	);

	const offerId = getRandomBigNumber();

	beforeAll(async () => {
		const giveAliceAndBobSolIxs: Array<TransactionInstruction> = [alice, bob].map((owner) =>
			SystemProgram.transfer({
				fromPubkey: provider.publicKey,
				toPubkey: owner.publicKey,
				lamports: 10 * LAMPORTS_PER_SOL,
			})
		);

		const usdcSetupIxs = await createTokenAndMintTo(connection, provider.publicKey, usdcMint.publicKey, 6, alice.publicKey, [
			{ recipient: alice.publicKey, amount: 90_000_000 },
			{ recipient: bob.publicKey, amount: 20_000_000 },
		]);

		const wifSetupIxs = await createTokenAndMintTo(connection, provider.publicKey, wifMint.publicKey, 6, bob.publicKey, [
			{ recipient: alice.publicKey, amount: 5_000_000 },
			{ recipient: bob.publicKey, amount: 300_000_000 },
		]);

		let tx = new Transaction();
		tx.instructions = [...giveAliceAndBobSolIxs, ...usdcSetupIxs, ...wifSetupIxs];

		const _setupTxSig = await provider.sendAndConfirm(tx, [alice, bob, usdcMint, wifMint]);
	});

	const makeOfferTx = async (
		maker: Keypair,
		offerId: BN,
		offeredTokenMint: PublicKey,
		offeredAmount: BN,
		wantedTokenMint: PublicKey,
		wantedAmount: BN
	): Promise<{
		offerAddress: PublicKey;
	}> => {
		// Approve delegate to move offered tokens
		const approveIx = createApproveCheckedInstruction(
			aliceUsdcAccount, // Token Account
			offeredTokenMint, // Token Mint
			maker.publicKey, // Delegate
			alice.publicKey, // Owner
			offeredAmount.toNumber(), // Amount
			6, // Decimals - should match the decimals of the token mint
			[], // Signers
			TOKEN_PROGRAM_ID // Token Program ID
		);

		const transactionSignature = await program.methods
			.makeOffer(offerId, offeredAmount, wantedAmount)
			.accounts({
				maker: maker.publicKey,
				tokenMintA: offeredTokenMint,
				tokenMintB: wantedTokenMint,
			})
			.signers([maker])
			.preInstructions([approveIx])
			.rpc();

		await confirmTransaction(connection, transactionSignature);

		const [offerAddress] = PublicKey.findProgramAddressSync([Buffer.from('offer'), maker.publicKey.toBuffer(), offerId.toArrayLike(Buffer, 'le', 8)], program.programId);

		return { offerAddress };
	};

	const takeOfferTx = async (offerAddress: PublicKey, taker: Keypair): Promise<void> => {
		const transactionSignature = await program.methods
			.takeOffer()
			.accounts({
				taker: taker.publicKey,
			})
			.signers([taker])
			.rpc();

		await confirmTransaction(connection, transactionSignature);
	};

	test('Offer created by Alice, vault holds the offer tokens', async () => {
		const offeredUsdc = new BN(10_000_000);
		const wantedWif = new BN(100_000_000);

		const getTokenBalance = getTokenBalanceOn(connection);

		try {
			const { offerAddress } = await makeOfferTx(alice, offerId, usdcMint.publicKey, offeredUsdc, wifMint.publicKey, wantedWif);

			// Check balances before offer creation
			expect(await getTokenBalance(aliceUsdcAccount)).toEqual(new BN(90_000_000));
			expect(await getTokenBalance(aliceWifAccount)).toEqual(new BN(5_000_000));
			expect(await getTokenBalance(bobUsdcAccount)).toEqual(new BN(20_000_000));
			expect(await getTokenBalance(bobWifAccount)).toEqual(new BN(300_000_000));

			// Fetch offer account and verify
			const offerAccount = await program.account.offer.fetch(offerAddress);
			expect(offerAccount.maker.toBase58()).toEqual(alice.publicKey.toBase58());
			expect(offerAccount.tokenMintA.toBase58()).toEqual(usdcMint.publicKey.toBase58());
			expect(offerAccount.tokenMintB.toBase58()).toEqual(wifMint.publicKey.toBase58());
			expect(offerAccount.tokenBWantedAmount.toString()).toEqual(wantedWif.toString());
		} catch (error) {
			console.error('Transaction failed:', error);
			if (error.logs) {
				console.error('Transaction logs:', error.logs);
			}
			throw error;
		}
	});

	test('Offer taken by Bob, tokens balances are updated', async () => {
		const getTokenBalance = getTokenBalanceOn(connection);

		try {
			const { offerAddress } = await makeOfferTx(alice, offerId, usdcMint.publicKey, new BN(10_000_000), wifMint.publicKey, new BN(100_000_000));

			// Verify token balances before taking the offer
			expect(await getTokenBalance(aliceUsdcAccount)).toEqual(new BN(90_000_000));
			expect(await getTokenBalance(aliceWifAccount)).toEqual(new BN(5_000_000));
			expect(await getTokenBalance(bobUsdcAccount)).toEqual(new BN(20_000_000));
			expect(await getTokenBalance(bobWifAccount)).toEqual(new BN(300_000_000));

			await takeOfferTx(offerAddress, bob);

			// Verify token balances after taking the offer
			expect(await getTokenBalance(aliceUsdcAccount)).toEqual(new BN(80_000_000)); // 10,000,000 should be deducted
			expect(await getTokenBalance(aliceWifAccount)).toEqual(new BN(10_000_000)); // 5,000,000 should be added
			expect(await getTokenBalance(bobUsdcAccount)).toEqual(new BN(30_000_000)); // 10,000,000 should be added
			expect(await getTokenBalance(bobWifAccount)).toEqual(new BN(290_000_000)); // 10,000,000 should be deducted
		} catch (error) {
			console.error('Transaction failed:', error);
			if (error.logs) {
				console.error('Transaction logs:', error.logs);
			}
			throw error;
		}
	});
});
