# bytecheck — demo narration

## s1 hook
An agent that moves treasury funds does not build its own transaction. It describes one. A function name, a list of arguments. Something else turns that description into bytes and sends it. Between the description and the chain, the bytes are somebody else's to choose.

## s2 problem
Here is KeeperHub, on main, today. The simulate path applies coerce, then reshape. All three sibling call sites do the reverse. The order matters, because coerceTuple returns early unless its value is already a structured object. Before reshape has run, a tuple's fields are still flat, so coerce never reaches the bool inside it. KeeperHub's own comment says what happens next. Ethers encodes booleans by truthiness, so the string false becomes true.

## s3 divergence
This runs offline. No API key, no network. The same request body, encoded down both paths. Same selector. Same length. Word one differs. The dry run encodes the flag as true. The broadcast encodes it as false. A treasury approved one branch, and the chain ran the other. Viem refuses the same input outright, which puts the cause on the encoder, not on the arguments.

## s4 fix
KeeperHub already got this right in one place. Its raw calldata route decodes, re-encodes, and refuses anything non canonical. But that guards one route, and a Safe cannot see which route its relayer chose. So the check moves to the Safe. The proposer signs a hash of the exact bytes. Any relayer may submit. One byte different means a different recovered signer, and a revert before anything moves. The relayer becomes a courier.

## s5 tests
Seventeen tests, all passing, including a fuzz over arbitrary byte mutations. Two of them are the product. The first signs the bytes for false, then submits the bytes for true, exactly the drift the simulate path produces. The module refuses. Neither branch counter moves. The second is the counterfactual. The same drifted bytes, with no module. The wrong branch runs, and money moves. That is what every integration trusting its relayer's encoder does today.

## s6 close
What is proven here is the contract, the tests, and the divergence. What is not, is a live KeeperHub execution. The organization key was unavailable before the deadline, so there is no transaction hash, and a screenshot of one would not be a transaction either. The module is ready for it. The finding goes upstream regardless. bytecheck. Sign the bytes, not the description.
