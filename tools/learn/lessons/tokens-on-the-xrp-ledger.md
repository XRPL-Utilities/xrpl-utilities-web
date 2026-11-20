title: XRP Ledger Tokens and Stablecoins, Explained Simply
description: How dollars and other assets live on the XRP Ledger as tokens, why you have to say yes before you can hold one, and what an issuer can and can't do.
h1: Tokens: dollars and more on the XRP Ledger
updated: 2026-11-20
hero: hero-tokens
card: Dollars and more on the ledger, and the promise behind each one.
short: A token is anything on the XRP Ledger other than XRP. Someone issues it, usually as a promise backed by something real, like a dollar. You have to say yes before you can hold one, and it's only as good as its issuer.
---
## XRP is built in. Everything else is a token.

[Lesson 3](/learn/what-is-xrp/) covered XRP, the currency built into the ledger. The ledger can hold a lot more than XRP, though. Dollars, euros, gold, shares in a fund. Each of those shows up as a token.

Anyone with an account can issue a token. Most useful tokens stand for something real that the issuer holds outside the ledger. A dollar token, often called a stablecoin, is meant to be worth exactly one dollar.

## How a dollar gets onto the ledger

Think of a coat check. You hand over your coat and get a ticket. The ticket is only worth something because the counter will give your coat back.

::: token-life

The ledger can't see inside the issuer's vault, so it can't check that the dollars are really there. That's why it matters who the issuer is.

## You have to say yes first

Nobody can put a token in your account without your OK. You first tell the ledger you'll accept that token from that issuer, and set a limit on how much. This is called a trust line.

::: trust

## What an issuer can and can't do

Because a token is the issuer's promise, the issuer keeps some control over it. XRP has no issuer, so none of this applies to it.

::: powers

Freezing and clawing back exist mostly so regulated companies can follow the law, for example when funds are tied to a crime. Before you hold a token, it's worth knowing who issued it.

## Three kinds of tokens

::: token-kinds

The ledger lets you trade most tokens in the same built-in marketplace from Lesson 3. That's how one person's dollar tokens can become another person's euro tokens in a single step.

## See it for yourself

Every page of the ledger shows these tokens moving. Here's what's inside the newest one.

::: live-tokens

Press the button again in a few seconds to open the next page. The mix changes every time.

## Common questions

?? Is a stablecoin the same as a dollar?
Not quite. It's a promise that you can trade it for a dollar. If the issuer can't or won't pay out, the token can be worth less than a dollar.

?? Who can issue a token?
Anyone with an XRP Ledger account. That's why it matters who the issuer is. The ledger checks the math, not the promise behind it.

?? Can someone send me a token I don't want?
No. A token can only land in your account after you've said yes to it with a trust line, or bought it yourself. The ledger also blocks payments that would put you over your limit.

?? Then why do random things show up in some wallets?
On the XRP Ledger, it's usually tiny XRP payments carrying a spam message, or NFT offers that do nothing unless you accept them. It can also be a token from an issuer you said yes to before, like for an airdrop. On some other blockchains, anyone can push a token into your wallet.

?? Does an issuer need XRP to back its token?
No. Say a bank issues 30,000 dollar tokens. It needs 30,000 real dollars, kept off the ledger in its bank account. It only needs a little XRP for its own reserve and fees.

?? Can my XRP be frozen like a token?
No. Nobody can freeze or claw back XRP on the ledger. An exchange can still freeze an account it runs for you, because then the exchange holds the XRP, not you.

?? Why does each trust line lock up XRP?
Each one takes up room on every copy of the ledger. The 0.2 XRP keeps people from opening thousands of them for nothing. Empty the trust line and close it, and that XRP is free again.

?? What's the difference between a token and an NFT?
One dollar token is the same as any other, like dollar bills. Each NFT is one of a kind, like a numbered concert ticket.

## Words used in this lesson

- **Token:** anything held on the XRP Ledger other than XRP.
- **Issuer:** the account that creates a token and stands behind it.
- **Stablecoin:** a token meant to stay worth one unit of a regular currency, like one US dollar.
- **Trust line:** your yes to holding a certain token from a certain issuer, up to a limit you set.
- **Freeze:** an issuer stopping a balance of its token from being sent.
- **Claw back:** an issuer taking its token back from a holder, if it switched that on before issuing.
- **Multi-Purpose Token (MPT):** the newer, simpler kind of token on the ledger.
- **NFT:** a non-fungible token, one of a kind and not used for payments.

## Sources

- [Tokens](https://xrpl.org/docs/concepts/tokens) (all assets other than XRP are tokens, anyone can issue), xrpl.org
- [Stablecoins](https://xrpl.org/docs/concepts/tokens/fungible-tokens/stablecoins) (backed outside the ledger, depend on the issuer), xrpl.org
- [Trust Line Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/trust-line-tokens) (you can't be made to hold a token, limits), xrpl.org
- [Freezing Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes) (freeze types, XRP can't be frozen), xrpl.org
- [Clawing Back Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/clawing-back-tokens) (must be switched on before issuing, XRP can't be clawed back), xrpl.org
- [Multi-Purpose Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens) (holders must say yes first, issuer sets the rules at creation), xrpl.org
- [NFTokenCreateOffer](https://xrpl.org/docs/references/protocol/transactions/types/nftokencreateoffer) (an NFT offer does nothing until it's accepted), xrpl.org
- [Non-Fungible Tokens](https://xrpl.org/docs/concepts/tokens/nfts) (unique, not used for payments), xrpl.org
- [Reserves](https://xrpl.org/docs/concepts/accounts/reserves) (0.2 XRP per trust line), xrpl.org
