title: How the XRP Ledger Agrees Without Mining, in Plain English
description: No mining, no race. Here's how XRP Ledger validators compare notes and lock in a new page every few seconds, explained for anyone who has heard of Bitcoin.
h1: How the XRP Ledger agrees without mining
updated: 2026-11-14
hero: hero-vote
card: No mining and no race. Just validators comparing notes.
short: The XRP Ledger doesn't use mining. Trusted computers called validators compare their lists of new payments, and once at least 80% of them agree, the next page is locked in. It takes a few seconds, with no race to burn computing power.
---
## The problem every shared ledger has to solve

In Lesson 1 we pictured the XRP Ledger as a notebook, with an exact copy on computers all over the world. That raises a hard question. Who decides what goes on the next page?

Payments don't reach every computer at the same moment. Some arrive in a different order, and some arrive late.

Here's why that matters. Say Alice has 10 XRP. At the same moment, she sends 10 XRP to Bob and 10 XRP to Carol. Only one of those payments can go through. If half the computers pick Bob and half pick Carol, the copies stop matching and the notebook is useless.

Computer scientists call this the double-spend problem. A bank solves it easily, because the bank is the boss and its computer decides. A shared ledger has no boss, so it needs a set of rules that everyone follows. Those rules are called a consensus protocol.

## How Bitcoin solves it: a race

Bitcoin settles it with a race called mining. Computers called miners make guess after guess, looking for a number that fits a math puzzle. Almost every guess is wrong.

The first miner to find one that fits gets to write the next block. They're paid for it in new bitcoin plus the fees on the payments inside. On average a winner turns up about every ten minutes.

It works, but it's built on a race that takes a lot of computing power. To cheat, you'd need more computing power than everyone else put together. That's known as a 51% attack.

## How the XRP Ledger solves it: compare notes

The XRP Ledger skips the race. A group of servers called validators compare notes instead.

Every server keeps a list of validators it trusts not to gang up and cheat together. That list is called its Unique Node List, or UNL for short. Most servers use a recommended list. There are two of them, one from the XRP Ledger Foundation and one from Ripple. On November 9, 2026, both lists named the same 35 validators.

Every few seconds, the validators go through the same steps:

1. **Collect.** Each validator gathers the payments it has heard about that aren't on a page yet.
2. **Propose.** It shares that list with the others. This is called a proposal.
3. **Adjust.** It looks at the other proposals and drops anything most validators haven't seen. Dropped payments aren't lost. They just wait for the next page.
4. **Repeat.** The validators go back and forth a few times. With each round, the bar for agreement goes up, from 50% to a final 80%.
5. **Lock it in.** Each validator applies the agreed payments in the same order and shares a signed copy of the result. When at least 80% of the trusted validators end up with matching results, the page is final.

With 35 validators on the list, that means 28 of them have to match. Nobody wins anything, and no new XRP gets made. Every XRP that will ever exist was created when the ledger started.

::: vote

## What if some validators go bad?

The rules are built for that. A validator could crash, lose its internet connection, or be run by someone dishonest.

- **Fewer than 20% go bad.** On a list of 35, that's up to 7. The rest still reach 80%, so pages keep getting locked in like nothing happened.
- **Between 20% and 80% go bad.** The honest ones can't reach 80% on their own. So the network pauses instead of guessing. It doesn't add a wrong page, and it picks back up once enough validators return.
- **More than 80% team up.** Only then could a bad page get through. That's why the recommended lists are spread across different owners in different countries.

There's no 51% attack either, because there's no mining to take over.

## Trusted doesn't mean in charge

Anyone can run a validator. It only counts for the servers that choose to put it on their list.

Validators also can't move your money. Every payment has to be signed by the account sending it, and every server checks that signature for itself. A payment without a proper signature never goes in, even if every validator wanted it to.

What validators do is agree on which signed payments go on the next page, and in what order. That's the whole job.

## See it for yourself

Here are the newest pages of the ledger. Each one was locked in by the validators the same way you just saw.

::: live-chain

You can also watch the validators themselves. Open [the validator list on livenet.xrpl.org](https://livenet.xrpl.org/network/validators) to see who they are and whether each one agreed on the latest page.

## Common questions

?? Do validators get paid?
Not by the ledger. No new XRP is created, and transaction fees are destroyed rather than handed out. The people and groups who run validators usually do it because they rely on the network working.

?? Is this the same as proof of stake?
No. Proof of stake gives a bigger say to whoever locks up more coins. On the XRP Ledger, owning more XRP doesn't get you a bigger vote.

?? Does Ripple control the validators?
No. Ripple publishes one of the two recommended lists, and the XRP Ledger Foundation publishes the other. Each validator is run by its own operator, and any server can pick its own list.

?? What happens if the validators can't agree?
The network pauses and adds nothing until they can. It's built to stop rather than write down something wrong.

?? What if one validator keeps disagreeing?
It gets outvoted. The page goes in with the validators that match, and the odd one out has to drop its version and take the agreed page. If it keeps happening, servers can take it off their trusted list. The recommended lists also drop validators that aren't reliable.

?? Why 80%?
It's high enough that a few broken or dishonest validators can't push a bad page through. It's also low enough that the network keeps going when a few of them go offline.

## Words used in this lesson

- **Double spend:** trying to spend the same money twice.
- **Consensus protocol:** the rules a shared ledger follows so every copy agrees.
- **Mining:** Bitcoin's way of agreeing, a guessing race to write the next block.
- **Validator:** a server that helps decide which payments go on the next page.
- **Unique Node List (UNL):** the list of validators a server trusts.
- **Recommended list:** a ready-made UNL that most servers use.
- **Proposal:** a validator's list of payments it thinks should go on the next page.
- **Validation:** a validator's signed copy of the finished page.
- **Supermajority:** at least 80% of the trusted validators.

## Sources

- [Consensus Protocol](https://xrpl.org/docs/concepts/consensus-protocol), xrpl.org
- [Consensus Structure](https://xrpl.org/docs/concepts/consensus-protocol/consensus-structure) (rounds from 50% to 80%), xrpl.org
- [Consensus Principles and Rules](https://xrpl.org/docs/concepts/consensus-protocol/consensus-principles-and-rules) (double spends, signatures), xrpl.org
- [Unique Node List](https://xrpl.org/docs/concepts/consensus-protocol/unl) (the two recommended lists), xrpl.org
- [Consensus Protections Against Attacks and Failure Modes](https://xrpl.org/docs/concepts/consensus-protocol/consensus-protections) (no 51% attack), xrpl.org
- [Transaction Cost](https://xrpl.org/docs/concepts/transactions/transaction-cost) (fees are destroyed), xrpl.org
- [Tokens](https://xrpl.org/docs/concepts/tokens) (all XRP was created with the ledger), xrpl.org
- [Mining](https://developer.bitcoin.org/devguide/mining.html) (block reward and fees go to the miner), developer.bitcoin.org
- Validator count: checked by us on November 9, 2026, from the two recommended lists at vl.xrplf.org and vl.ripple.com. Both listed the same 35 validators.
