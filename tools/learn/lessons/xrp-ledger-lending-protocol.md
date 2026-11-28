title: XRP Ledger Lending Protocol, Part 1: Vaults
description: How XRP Ledger vaults pool money for loans, what your shares are worth, and what happens when a borrower doesn't pay. Explained for anyone new to crypto.
h1: Vaults: the pool every loan comes from
updated: 2026-11-28
hero: hero-vault
card: Lots of people put money in. Loans go out. Everyone owns a share.
short: A vault is a shared pool on the XRP Ledger. Many people put the same kind of money in and get shares back. Loans are paid out of the pool. When borrowers pay interest, every share is worth more. When a loan goes bad, every share is worth less.
---
## Where does loan money come from?

When a bank gives someone a loan, it's lending out money that other people deposited. You never see where your money went or how the loans are doing.

The XRP Ledger is about to get its own way to lend, built into the ledger itself. It comes in two parts. This lesson covers the first part, the vault. That's the pool of money every loan comes from. Lesson 7 covers the loans.

Both are new features, so they go through the vote you saw in [Lesson 5](/learn/xrp-ledger-amendments/). As of November 27, both are past 80%. There's a live count at the bottom of this page.

## Who's who

::: vault-roles

Notice what's missing. There's no bank in the middle. The rules for who gets what are part of the ledger, and anyone can check them.

## How a vault gets made

Anyone with an XRP Ledger account can make a vault. That could be a bank, a fund, a lending company or one person. Whoever makes it owns it. For now, the owner is also the only one who can set up lending on it, so the owner and the loan broker are the same.

Making one takes a single transaction with a handful of choices. Try it.

::: vault-make

Most of those choices are locked in for good once the vault exists. People who join know the rules can't be changed on them later.

## Try it: put money in a vault

Below is a pretend vault that holds a dollar token, like the ones from [Lesson 4](/learn/tokens-on-the-xrp-ledger/). Step through what happens to your share of it.

::: vault-life

Your shares never change. What changes is how much each share is worth. That's the whole idea of a vault.

## What keeps a vault fair

::: vault-facts

The broker can't just take the money. But the broker picks the borrowers, so a careless broker can still lose it.

## Open vaults and fixed-schedule vaults

An open vault lets people put money in and take it out whenever they like.

The lending vote includes an update that adds vaults with a fixed schedule. Once it's on, loans can only come from these fixed-schedule vaults. Click through the three stages.

::: vault-stages

The dates are set when the vault is made and can't be changed later. Everyone knows up front how long their money will be tied up.

## Public and private vaults

Anyone can join a public vault.

A private vault only takes money from people with a pass from a checker the vault trusts. Think of it like a members-only club that checks your ID at the door. Banks and funds that must know who they deal with would use these.

The owner picks private when making the vault, and can't switch it later. The vault then points to a guest list on the ledger. The list doesn't name people. It names which checkers' passes count. Anyone can set up a list like that, and its owner can update it.

If your pass runs out, you can't add more money. But you can always cash out the shares you already have. The broker can't lock you in.

## What if a borrower doesn't pay?

These loans don't have collateral. Nobody hands over a car or a house to back them. The broker checks borrowers out the old-fashioned way, off the ledger, before lending to them.

To give the broker a reason to choose well, the broker can put some of its own money in first. It's called first-loss capital, and it's the money that gets hit first when a loan goes bad. If the broker's cushion runs too low, the broker can't make new loans or collect its fees until it tops it back up.

That cushion only covers part of a loss. Whatever it doesn't cover comes out of the vault, and every share is worth a little less.

## See it for yourself

Vaults and lending are being voted on right now. Here's where each one stands, live from the ledger.

::: live-lending

If support stays above 80% for two weeks, vaults switch on first, then lending. If it slips even once, the clock starts over, just like in Lesson 5.

## Common questions

?? Can I lose money in a vault?
Yes. If borrowers don't pay and the broker's cushion doesn't cover it, the vault loses money and so do your shares. There's no government insurance like many bank accounts have.

?? What kinds of money can go in a vault?
One kind per vault. It can be XRP or a token, like a dollar token. That's why the official name is single asset vault.

?? Is a vault the same as an AMM pool?
No. An AMM pool holds two kinds of money so people can swap one for the other. A vault holds one kind, and it's there to be lent out.

?? Can I give my shares to someone else?
If the vault allows it, yes. You send them like any other token. In a private vault, the person getting them needs a pass too.

?? Can the issuer of a token still freeze it inside a vault?
Yes. The issuer's powers from Lesson 4 still apply. An issuer can freeze its token, or take it back if it turned that power on, even when it sits in a vault.

?? When can I use a vault?
Not yet on the live ledger. Vaults switch on only after the vote passes. The box above shows the latest count.

## Words used in this lesson

- **Vault:** a shared pool of one kind of money on the XRP Ledger, which loans can be paid out of.
- **Share:** a token that shows how much of a vault you own.
- **Depositor:** someone who puts money in a vault.
- **Loan broker:** the person or company that runs a vault and decides who gets a loan.
- **First-loss capital:** the broker's own money, set aside to take the first hit when a loan goes bad.
- **Collateral:** something a borrower hands over to back a loan, like a house for a mortgage. These loans don't use it.
- **Private vault:** a vault that only takes money from people with an approved pass.
- **Vault owner:** the account that made the vault. Right now it's also the one that runs lending on it.

## Sources

- [Single Asset Vaults](https://xrpl.org/docs/concepts/tokens/single-asset-vaults) (shares, public and private, fixed-schedule vaults, the vault account, freezes), xrpl.org
- [VaultCreate](https://xrpl.org/docs/references/protocol/transactions/types/vaultcreate) (who makes a vault, the choices, which ones are locked), xrpl.org
- [Permissioned Domains](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/permissioned-domains) (the guest list of accepted passes), xrpl.org
- [Lending Protocol](https://xrpl.org/docs/concepts/tokens/lending-protocol) (brokers, depositors, borrowers, no collateral, first-loss capital), xrpl.org
- [Amendments](https://xrpl.org/docs/concepts/networks-and-servers/amendments) (80% for two weeks), xrpl.org
- Vote counts: read by us from the XRP Ledger on November 27, 2026. Vaults passed 80% on November 25 and lending on November 27.
