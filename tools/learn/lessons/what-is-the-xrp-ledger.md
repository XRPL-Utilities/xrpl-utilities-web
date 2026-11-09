title: What Is the XRP Ledger? A Plain-English Guide
description: The XRP Ledger is a shared record of payments that computers all over the world keep in sync. Here's how it works, explained without the jargon.
h1: What is the XRP Ledger?
updated: 2026-11-10
short: The XRP Ledger is a shared record of payments and balances that computers all over the world keep identical copies of. A new page gets added about every four seconds, and no single company owns it.
---
## Start with a notebook

Picture a notebook where every payment gets written down. Who paid whom, how much, and when.

Now make an exact copy of that notebook for every computer that wants one, anywhere in the world. Every time a new page is ready, the computers compare notes. The page only gets added once they agree it's right.

That's the XRP Ledger. "Ledger" is just an old word for a record book. Banks keep ledgers too, but a bank's ledger lives on the bank's own computers, and you have to trust the bank to keep it straight. The XRP Ledger is kept by many computers at once, so you don't have to trust any one of them.

## Who keeps the notebook?

Anyone can run the software and keep a copy. Most of those computers (called servers) just follow along and pass new payments around.

A smaller group, called validators, does the agreeing. They look at the payments waiting to go in, compare their lists with each other, and when enough of them match, the new page is locked in. The whole round takes a few seconds. Over the 20,000 pages before November 9, 2026, it averaged just over four seconds a page.

Lesson 2 covers how that agreement works, and why it doesn't need mining.

## How is this different from Bitcoin?

Bitcoin and the XRP Ledger do the same basic job. Both keep a shared record that nobody can secretly rewrite. They just go about it differently.

- **Speed.** Bitcoin adds a new page (it calls them blocks) about once every ten minutes. The XRP Ledger adds one about every four seconds.
- **How they agree.** Bitcoin computers race each other to solve a math puzzle, which takes a lot of computing power. That race is called mining. XRP Ledger validators skip the race and compare notes instead.
- **What's built in.** On Bitcoin, the main thing you can do is send bitcoin. The XRP Ledger was built to hold more than one kind of money. It has its own currency, XRP, plus tokens for things like dollars, and a built-in marketplace for swapping between them. Later lessons cover each of these.

## What actually goes in it?

Each page of the XRP Ledger (each "ledger version") holds three things:

1. **A page number**, called the ledger index, so everyone knows the order.
2. **The transactions** that happened since the last page. Payments, mostly.
3. **The current state of every account**: balances, settings, and anything else the accounts own.

Each page also carries a fingerprint of the page before it. Change anything on an old page and its fingerprint no longer matches, so tampering shows right away. This is the "chain" part of blockchain.

## Where did it come from?

Three engineers, Jed McCaleb, Arthur Britto and David Schwartz, built the XRP Ledger in 2011 and early 2012. It has been running ever since.

You'll often hear the name Ripple too. Ripple is a company that was founded in 2012 and builds on the XRP Ledger. The ledger itself is an open network that anyone can use, and nobody needs permission to run a copy.

## Can I try it without spending anything?

Yes. Besides the main network (called Mainnet), there are two practice networks, Testnet and Devnet. You can get a free test account loaded with fake XRP and send payments to see how it works. Nothing on those networks has any real value.

## See it for yourself

You don't have to take our word for any of this. Every page of the ledger is public.

Here's one we picked: [ledger 108,226,016](https://livenet.xrpl.org/ledgers/108226016) closed on Monday, November 9, 2026 at 4:54 PM Eastern with 181 transactions in it. Click through and you'll see each transaction, the page number, and its fingerprint.

Want to watch pages being added live? Open [livenet.xrpl.org](https://livenet.xrpl.org) and wait a few seconds.

## Common questions

?? Is the XRP Ledger the same as Ripple?
No. Ripple is a company. The XRP Ledger is an open network that Ripple and many others use. Anyone can run a copy without asking Ripple or anyone else.

?? Is XRP the same as the XRP Ledger?
No. XRP is the currency built into the XRP Ledger. The ledger is the record book, and XRP is one of the things written in it. Lesson 3 covers what XRP is for.

?? Does the XRP Ledger use mining?
No. Validators agree by comparing notes, not by racing to solve puzzles. That's why a page takes seconds instead of minutes.

?? Who's in charge of the XRP Ledger?
No single person or company. Changes to the rules have to be voted in by validators, and Lesson 5 shows how that vote works.

?? Can someone change an old payment?
Not quietly. Every page carries a fingerprint of the one before it, so a changed page would stand out right away and the validators would reject it.

## Words used in this lesson

- **Ledger:** a record book of payments and balances.
- **Ledger version:** one page of the XRP Ledger. A new one gets added every few seconds.
- **Ledger index:** the page number of a ledger version.
- **Transaction:** anything that changes the ledger, like a payment.
- **Server:** a computer running the XRP Ledger software and keeping a copy.
- **Validator:** a server that helps decide which transactions go on the next page.
- **Consensus:** the process validators use to agree on the next page.
- **Blockchain:** a chain of record pages, each one linked to the one before it.
- **Mainnet and Testnet:** the real network, and a practice network with fake money.

## Sources

- [What is the XRP Ledger?](https://xrpl.org/docs/introduction/what-is-the-xrp-ledger), xrpl.org
- [Ledgers](https://xrpl.org/docs/concepts/ledgers), xrpl.org
- [What is XRP?](https://xrpl.org/docs/introduction/what-is-xrp) (history and naming), xrpl.org
- [Consensus Protocol](https://xrpl.org/docs/concepts/consensus-protocol), xrpl.org
- [Block chain guide](https://developer.bitcoin.org/devguide/block_chain.html) (2,016 blocks every two weeks, which works out to ten minutes a block), developer.bitcoin.org
- Average page time: measured by us from the public ledger. The 20,000 ledgers ending at 108,226,016 averaged 4.03 seconds each.
