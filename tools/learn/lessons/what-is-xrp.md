title: What Is XRP For? The XRP Ledger's Currency, Explained
description: XRP is the currency built into the XRP Ledger. Here are the four jobs it does, from paying fees to bridging currencies, explained for anyone new to crypto.
h1: What XRP is actually for
updated: 2026-11-15
hero: hero-xrp
card: Four jobs for the currency built into the ledger.
short: XRP is the currency built into the XRP Ledger. Every transaction pays its small fee in XRP, whatever currency is being sent. XRP also keeps each account open and can bridge two currencies that rarely trade. And no company issued it. All of it was created when the ledger started.
---
## The ledger's own money

Bitcoin has bitcoin. The XRP Ledger has XRP.

When the ledger started in 2012, there were 100 billion XRP. That's all there will ever be, because no new XRP can be made. The smallest piece is called a drop, and a million drops make one XRP.

The ledger can hold other kinds of money too, like digital dollars. But XRP is the only one built in. That gives it four jobs.

## Job 1: paying for every transaction

Every transaction costs a tiny bit of XRP. The usual fee is 10 drops, or 0.00001 XRP.

That goes for anything you send, not just XRP. Send XRP, a digital dollar like RLUSD, or any other token on the ledger, and the fee is still paid in XRP.

::: fee-burn

Here's the odd part. That fee isn't paid to anyone. It's destroyed. No validator gets it, and neither does any company.

So why charge it at all? To stop spam. A few drops is nothing for a real payment. But someone trying to flood the network with millions of junk transactions would burn through their XRP fast. When the network gets busy, the fee goes up for a while, which makes flooding it even more costly.

## Job 2: keeping your account open

An account needs at least 1 XRP in it to exist. That 1 XRP is called the reserve, and you can't send it away.

Why? Every account takes up room on every copy of the ledger, all over the world. There's no set limit on how many accounts there can be. But each one costs 1 XRP to keep, so nobody can cheaply make millions of junk accounts and make every copy bigger.

::: reserve

The reserve isn't paid or destroyed. It just stays in your account. The amounts can change, too, if the validators vote for new ones. [Lesson 2](/learn/xrp-ledger-consensus/) explains who the validators are.

## Job 3: a bridge between currencies

The XRP Ledger has a built-in marketplace where people swap one currency for another. Some pairs trade a lot. Others hardly trade at all.

Say Anita wants to swap British pounds for Brazilian reais, and few people swap those two directly. Plenty of people swap pounds for XRP, though, and XRP for reais.

::: bridge

The ledger checks both routes for her. If going through XRP gives a better rate, it does that in the same step. It's called auto-bridging, and it only works because XRP is built in.

## Job 4: no company behind it

Every other kind of money on the ledger was issued by someone. A stablecoin, for example, is a company's promise to pay you back a dollar.

::: owed

XRP has no issuer. When you own XRP, you own the XRP itself, not a company's promise. So there's no company that could fail to pay you back. It also can't be frozen by an issuer, because there isn't one.

## See it for yourself

Every page of the ledger records how much XRP is left. Since the ledger started with exactly 100 billion, you can see how much fees have destroyed so far.

::: supply

Leave this page open for a minute, then press "Check again." The number keeps dropping as new transactions pay their fees.

## Common questions

?? Is XRP the same as Ripple?
No. Ripple is a company that builds on the XRP Ledger. XRP is the currency built into the ledger. The names got mixed up early on, because the ledger itself was first called "Ripple."

?? Can more XRP be created?
No. All 100 billion XRP were created when the ledger started, and no new XRP can be made. Fees destroy a little every few seconds, so the total only ever goes down.

?? Who got the XRP when it was made?
In 2012, 80 billion XRP went to the company now called Ripple, in return for building on the ledger. The other 20 billion went to the founders. In 2017, Ripple locked 55 billion away in escrow, to be released over time.

?? Do I need XRP to hold a stablecoin on the XRP Ledger?
Yes. Every account needs the 1 XRP reserve, plus a little more for each token it holds. And every transaction you send, in any currency, pays its fee in XRP.

?? Is there a limit on how many accounts there can be?
No set limit. The reserve is what keeps the number sensible, since every account has to hold at least 1 XRP. The goal, per xrpl.org, is that an ordinary server can always hold the whole ledger in memory.

?? Can I get my reserve back?
Partly. Remove a token or an offer and its 0.2 XRP is free again. You can also delete the whole account. That costs a fee of 0.2 XRP, and the rest of the reserve can then go to another account.

?? What's a drop?
The smallest amount of XRP. One XRP is a million drops, the way a dollar is 100 cents. Fees are usually counted in drops because they're so small.

## Words used in this lesson

- **XRP:** the currency built into the XRP Ledger.
- **Drop:** one millionth of an XRP.
- **Transaction cost:** the small fee each transaction pays in XRP, which is destroyed.
- **Reserve:** the XRP an account must keep, 1 XRP plus 0.2 XRP for each item it owns.
- **Auto-bridging:** when the ledger's marketplace goes through XRP to swap two other currencies at a better rate.
- **Issuer:** the account that creates a token and stands behind it. XRP has none.
- **Stablecoin:** a token meant to always be worth the same as a regular currency, like one US dollar.
- **Escrow:** XRP locked away until a set time or condition.

## Sources

- [What is XRP?](https://xrpl.org/docs/introduction/what-is-xrp) (100 billion at the start, 80 billion to Ripple in 2012, 55 billion escrowed in 2017, the name), xrpl.org
- [Tokens: differences from XRP](https://xrpl.org/docs/concepts/tokens) (reserve and fees, drops, no new XRP can be minted), xrpl.org
- [Transaction Cost](https://xrpl.org/docs/concepts/transactions/transaction-cost) (10 drops, destroyed, rises with load), xrpl.org
- [Reserves](https://xrpl.org/docs/concepts/accounts/reserves) (1 XRP base, 0.2 XRP per item, changed by validator vote), xrpl.org
- [Deleting Accounts](https://xrpl.org/docs/concepts/accounts/deleting-accounts) (getting the reserve back), xrpl.org
- [Auto-Bridging](https://xrpl.org/docs/concepts/tokens/decentralized-exchange/autobridging) (the pounds and reais example), xrpl.org
- [Currency Formats](https://xrpl.org/docs/references/protocol/data-types/currency-formats) (XRP has no issuer and can't be frozen), xrpl.org
- Current fee and reserve: checked by us on November 15, 2026, from a public XRP Ledger server (10 drops, 1 XRP base, 0.2 XRP per item).
