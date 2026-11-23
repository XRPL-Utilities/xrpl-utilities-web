title: How the XRP Ledger Adds New Features: Amendments
description: No company can switch on a new XRP Ledger feature by itself. Here's how validators vote new features in, explained for anyone new to crypto.
h1: How new features get voted in
updated: 2026-11-24
hero: hero-amend
card: Nobody flips the switch alone. The validators vote.
short: New XRP Ledger features arrive switched off. Validators then vote on each one. If 80% of the trusted validators say yes and keep saying yes for two weeks, it switches on for everyone at the same moment. That built-in vote is called an amendment.
---
## The ledger runs on rules. Who gets to change them?

Every copy of the XRP Ledger follows the same rules. That's how they all end up with the same pages, as you saw in [Lesson 2](/learn/xrp-ledger-consensus/).

But the rules do change. New kinds of payments get added, and bugs get fixed. If one copy switched to new rules before the others, the copies would stop matching.

So the XRP Ledger has a built-in vote for every change to the rules. Each change is called an amendment.

## How a new feature gets in

Anyone can propose a new feature. It starts as a public write-up called an XRP Ledger Standard, or XLS for short. Each one gets a number, like XLS-33 for the MPTs from [Lesson 4](/learn/tokens-on-the-xrp-ledger/).

Here's the whole trip, from an idea to a feature you can use.

::: amend-path

Steps 1 to 4 are about the code. Steps 5 and 6 are about the rules. A server can run the new code for months while the feature stays off. Only the vote turns it on.

## Who decides what goes in the code?

The server software is open source. Anyone can read the code or suggest a change. A small group called maintainers decides what gets added and when a new version ships.

As of November 2026, five of the seven maintainers work at Ripple. The other two come from the XRP Ledger Foundation, a nonprofit, and XRPL Labs. Most of the code reviewers work at Ripple too.

::: amend-powers

That's why the vote matters. The maintainers can ship new code, but they can't switch a feature on. Only the validators can, and Ripple runs one of the 35.

## Try it: get a feature switched on

The validators from Lesson 2 are the voters. Each one says yes or no, and the votes get counted about four times an hour.

Below is a pretend run of a real vote, the one for MPTs. Step through it, then run a vote of your own.

::: amend-vote

The two weeks give everyone running a server time to upgrade before the change lands. Saying yes isn't a one-time thing, either. Support has to hold the whole way through.

If support slips under 80% even once, the clock doesn't pause. It's thrown out, and a fresh two weeks starts when support comes back. A feature can win and lose 80% many times before it switches on.

## What about servers that don't upgrade?

::: amend-blocked

A server that's missing the new code can't tell what the new pages mean. Rather than guess, it stops until its owner upgrades. The ledger calls that being amendment blocked.

## Once it's on, it stays on

A feature that passes is on for good. There's no off switch. Turning it off would take a new amendment and a new vote, passed the same way.

Bug fixes go through the same vote. You can spot them on the list, because their names usually start with "fix."

## See it for yourself

Here's what the validators are voting on right now, and how close each feature is. The tag next to each one is its XLS number, the public write-up you met above.

::: live-amend

This list is live. When a feature passes, it shows under "Just switched on" for 30 days. New features join the vote as new server versions come out.

Lessons 6, 7 and 8 cover three of the biggest features on this list.

## Common questions

?? Who gets a vote?
Only validators, and only the votes from trusted validators count. Those are the ones on the recommended lists most servers use, the same lists from Lesson 2.

?? What does XLS mean?
It stands for XRP Ledger Standard. It's the public write-up of a new feature, with a number, like XLS-33 for MPTs. Anyone can read one and comment on it.

?? Who writes new features?
Anyone can. The server software is open source, and the code lives in public. Most of the code is written and reviewed by people at Ripple, and a feature needs at least two reviewers to approve it.

?? Can one company switch on a feature by itself?
No. It needs 80% of the trusted validators. On November 23, 2026, the 35 validators on the recommended lists were run by 35 different groups. Ripple ran one of them, and six were run by universities.

?? Do I need to do anything when a feature switches on?
No. Your wallet or exchange runs the servers and handles the upgrades. The new feature just shows up as something you can use.

?? How long does it take?
At least two weeks once a feature reaches 80%. Some sit in the vote for months, and some never pass.

?? Can a feature be voted out later?
Not directly. Switching one off would need a new amendment, voted in the same way as any other change.

?? How many features have passed so far?
98 had passed by November 2026. The first ones were switched on in 2016.

## Words used in this lesson

- **Amendment:** a change to the XRP Ledger's rules, switched on by a vote.
- **Validator:** a server whose votes help decide each new page, and each new feature.
- **XLS:** short for XRP Ledger Standard. The numbered public write-up of a new feature.
- **Devnet:** a practice network where new features get tried out first. Its money isn't real.
- **Testnet:** a practice network that works like the real ledger, with play money. New server versions get tried there before release.
- **Maintainers:** the small group that decides what goes into the server software and when a new version ships.
- **Trusted validators:** the validators on the recommended lists most servers use. Only their votes count.
- **Amendment blocked:** what happens to a server that's missing the code for a feature that's now on. It stops until it's upgraded.
- **Fix:** an amendment that fixes a bug. Its name usually starts with "fix."

## Sources

- [Amendments](https://xrpl.org/docs/concepts/networks-and-servers/amendments) (80% for two weeks, the clock restarts, votes about four times an hour, amendment blocked servers, undoing one, bug fixes), xrpl.org
- [Contribute Code](https://xrpl.org/resources/contribute-code) (XLS write-ups, review, Devnet, Testnet, new versions about four times a year), xrpl.org
- [Contributing to the server software](https://github.com/XRPLF/rippled/blob/develop/CONTRIBUTING.md) (two approvals per change, the current maintainers and reviewers), GitHub
- [XRPL Standards](https://github.com/XRPLF/XRPL-Standards) (every XLS, in public), GitHub
- [Known Amendments](https://xrpl.org/resources/known-amendments) (the full list, with which ones are on), xrpl.org
- [Consensus](https://xrpl.org/docs/concepts/consensus-protocol) (validators and trusted lists), xrpl.org
- Validators and votes: checked by us on November 23, 2026, from public XRP Ledger data (35 trusted validators, 98 amendments on since 2016).
