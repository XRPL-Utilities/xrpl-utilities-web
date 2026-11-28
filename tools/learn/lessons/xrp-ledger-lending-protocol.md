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

## Try it: put money in a vault

Below is a pretend vault that holds a dollar token, like the ones from [Lesson 4](/learn/tokens-on-the-xrp-ledger/). Step through what happens to your share of it.

::: vault-life

Your shares never change. What changes is how much each share is worth. That's the whole idea of a vault.

## Shares are your receipt

When you put money in, the vault hands you shares. Shares are a kind of token, the MPTs from Lesson 4, made by the vault itself.

Each share is worth the money in the vault divided by the number of shares. If the vault holds 104,000 tokens and there are 100,000 shares, each share is worth 1.04 tokens.

Someone who joins later pays what a share is worth on that day. So they don't get a cut of interest that was earned before they showed up.

The vault also guards against a sneaky move. When a loan starts to look shaky, the broker can mark it down right away. Anyone who cashes out after that takes their part of the loss with them, so nobody can dodge it by leaving early.

## The money sits in an account nobody controls

The vault's money doesn't sit in the broker's wallet. It sits in a special account the ledger makes for the vault. Nobody has a key to it, and it can't send a payment on its own.

Money only leaves in a few ways. A shareholder cashes out, the broker makes a loan, or the token's issuer takes its token back. The broker can't just take it. But the broker does pick the borrowers, so a careless broker can still lose the pool's money.

## Open vaults and fixed-schedule vaults

An open vault lets people put money in and take it out whenever they like.

An update to lending, also in the vote right now, adds vaults that run on a fixed schedule. It also says loans can only come from these fixed-schedule vaults. Click through the three stages.

::: vault-stages

The dates are set when the vault is made and can't be changed later. Everyone knows up front how long their money will be tied up.

## Public and private vaults

Anyone can join a public vault.

A private vault only takes money from people with a pass from a checker the vault trusts. Think of it like a members-only club that checks your ID at the door. Banks and funds that must know who they deal with would use these.

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

## Sources

- [Single Asset Vaults](https://xrpl.org/docs/concepts/tokens/single-asset-vaults) (shares, public and private, fixed-schedule vaults, the vault account, freezes), xrpl.org
- [Lending Protocol](https://xrpl.org/docs/concepts/tokens/lending-protocol) (brokers, depositors, borrowers, no collateral, first-loss capital), xrpl.org
- [Amendments](https://xrpl.org/docs/concepts/networks-and-servers/amendments) (80% for two weeks), xrpl.org
- Vote counts: read by us from the XRP Ledger on November 27, 2026. Vaults passed 80% on November 25 and lending on November 27.
