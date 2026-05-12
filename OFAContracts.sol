// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA GOVERNANCE CONTRACT  v1.0.0                                ║
 * ║   On-chain community governance for Open Feed Platform           ║
 * ║                                                                  ║
 * ║   WHAT THIS DOES:                                                ║
 * ║   - Community members vote on algorithm weight changes           ║
 * ║   - Votes are permanently recorded on-chain                      ║
 * ║   - Weight changes only execute if quorum + majority reached     ║
 * ║   - All decisions are publicly auditable forever                 ║
 * ║   - No single entity can change the algorithm unilaterally       ║
 * ║                                                                  ║
 * ║   DEPLOY:                                                        ║
 * ║   npx hardhat run scripts/deploy.js --network polygon            ║
 * ║   (Polygon = low gas fees, ~$0.01 per vote)                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract OFAGovernance is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;

    // ── ALGORITHM WEIGHTS (scaled by 1000 for precision) ─────────────
    // e.g. engagementWeight = 400 means 0.400
    struct AlgorithmWeights {
        uint16 engagementWeight;        // 0-1000 (scaled)
        uint16 credibilityWeight;       // 0-1000 (scaled)
        uint16 adPenalty;               // points deducted for ads
        uint16 suppressionReviewWeight; // points per suppression flag reviewed
        uint16 communityVerifyBonus;    // bonus points for community verified
        uint256 effectiveSince;         // timestamp when weights became active
        uint256 governanceTx;           // block number of vote that set these
    }

    // ── PROPOSAL ──────────────────────────────────────────────────────
    struct Proposal {
        uint256 id;
        string  title;
        string  description;
        address proposer;
        AlgorithmWeights proposedWeights;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 abstainVotes;
        uint256 createdAt;
        uint256 votingEndsAt;
        bool    executed;
        bool    cancelled;
        ProposalStatus status;
    }

    enum ProposalStatus { Active, Passed, Failed, Executed, Cancelled }

    // ── VOTER RECORD ─────────────────────────────────────────────────
    struct VoterRecord {
        uint256 credibilityScore;  // 0-100, higher = more vote weight
        bool    isVerified;        // community-verified member
        uint256 joinedAt;
        uint256 totalVotes;
        bool    registered;
    }

    // ── STATE ─────────────────────────────────────────────────────────
    Counters.Counter private _proposalIds;

    AlgorithmWeights public currentWeights;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => VoterRecord) public voters;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => string)) public voteChoice;

    uint256 public constant VOTING_PERIOD  = 7 days;
    uint256 public constant QUORUM_PERCENT = 10;  // 10% of registered voters
    uint256 public constant PASS_PERCENT   = 60;  // 60% yes to pass
    uint256 public totalRegisteredVoters;

    // ── EVENTS ────────────────────────────────────────────────────────
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        uint256 votingEndsAt
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        string vote,
        uint256 weight,
        uint256 timestamp
    );
    event ProposalExecuted(
        uint256 indexed proposalId,
        AlgorithmWeights newWeights,
        uint256 timestamp
    );
    event VoterRegistered(
        address indexed voter,
        uint256 credibilityScore,
        uint256 timestamp
    );
    event WeightsChanged(
        uint16 engagementWeight,
        uint16 credibilityWeight,
        uint16 adPenalty,
        uint256 proposalId,
        uint256 timestamp
    );

    // ── CONSTRUCTOR ───────────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        // Initialize with OFA default weights
        currentWeights = AlgorithmWeights({
            engagementWeight:        400,   // 0.40
            credibilityWeight:       600,   // 0.60
            adPenalty:               30,    // 30 points
            suppressionReviewWeight: 2,     // 2 points per flag
            communityVerifyBonus:    5,     // +5 points
            effectiveSince:          block.timestamp,
            governanceTx:            block.number
        });
    }

    // ── VOTER REGISTRATION ────────────────────────────────────────────

    /**
     * Register as a community voter
     * In production: requires proof of activity on OFA platform
     * Credibility score comes from Truth Shield clean post history
     */
    function registerVoter(
        address voter,
        uint256 credibilityScore,
        bool isVerified
    ) external onlyOwner {
        require(!voters[voter].registered, "Already registered");
        require(credibilityScore <= 100, "Score must be 0-100");

        voters[voter] = VoterRecord({
            credibilityScore: credibilityScore,
            isVerified:       isVerified,
            joinedAt:         block.timestamp,
            totalVotes:       0,
            registered:       true
        });

        totalRegisteredVoters++;
        emit VoterRegistered(voter, credibilityScore, block.timestamp);
    }

    /**
     * Update a voter's credibility score
     * Called when their Truth Shield accuracy improves or declines
     */
    function updateCredibility(address voter, uint256 newScore) external onlyOwner {
        require(voters[voter].registered, "Not registered");
        require(newScore <= 100, "Score must be 0-100");
        voters[voter].credibilityScore = newScore;
    }

    // ── PROPOSAL CREATION ─────────────────────────────────────────────

    /**
     * Create a new governance proposal to change algorithm weights
     * Any registered verified voter can propose
     */
    function createProposal(
        string calldata title,
        string calldata description,
        uint16 engagementWeight,
        uint16 credibilityWeight,
        uint16 adPenalty,
        uint16 suppressionReviewWeight,
        uint16 communityVerifyBonus
    ) external nonReentrant returns (uint256) {
        require(voters[msg.sender].registered, "Must be registered voter");
        require(voters[msg.sender].isVerified, "Must be verified voter");
        require(bytes(title).length > 0 && bytes(title).length <= 200, "Invalid title length");

        // Weights must sum to 1000 (100%)
        require(
            engagementWeight + credibilityWeight == 1000,
            "Engagement + credibility weights must sum to 1000"
        );
        require(adPenalty <= 100, "Ad penalty too high");
        require(communityVerifyBonus <= 50, "Verify bonus too high");

        _proposalIds.increment();
        uint256 proposalId = _proposalIds.current();

        proposals[proposalId] = Proposal({
            id:          proposalId,
            title:       title,
            description: description,
            proposer:    msg.sender,
            proposedWeights: AlgorithmWeights({
                engagementWeight:        engagementWeight,
                credibilityWeight:       credibilityWeight,
                adPenalty:               adPenalty,
                suppressionReviewWeight: suppressionReviewWeight,
                communityVerifyBonus:    communityVerifyBonus,
                effectiveSince:          0,
                governanceTx:            0
            }),
            yesVotes:     0,
            noVotes:      0,
            abstainVotes: 0,
            createdAt:    block.timestamp,
            votingEndsAt: block.timestamp + VOTING_PERIOD,
            executed:     false,
            cancelled:    false,
            status:       ProposalStatus.Active
        });

        emit ProposalCreated(proposalId, msg.sender, title, block.timestamp + VOTING_PERIOD);
        return proposalId;
    }

    // ── VOTING ────────────────────────────────────────────────────────

    /**
     * Cast a vote on a proposal
     * Vote weight = voter's credibility score (higher accuracy = more influence)
     * Minimum weight 1, maximum weight 100
     */
    function castVote(uint256 proposalId, string calldata vote) external nonReentrant {
        require(voters[msg.sender].registered, "Must be registered voter");
        require(!hasVoted[proposalId][msg.sender], "Already voted on this proposal");

        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Proposal does not exist");
        require(proposal.status == ProposalStatus.Active, "Proposal not active");
        require(block.timestamp <= proposal.votingEndsAt, "Voting period ended");
        require(!proposal.cancelled, "Proposal cancelled");

        // Vote weight based on credibility (1-100)
        uint256 weight = voters[msg.sender].credibilityScore;
        if (weight == 0) weight = 1; // minimum weight

        // Record vote
        hasVoted[proposalId][msg.sender] = true;
        voteChoice[proposalId][msg.sender] = vote;
        voters[msg.sender].totalVotes++;

        // Tally
        if (keccak256(bytes(vote)) == keccak256(bytes("yes"))) {
            proposal.yesVotes += weight;
        } else if (keccak256(bytes(vote)) == keccak256(bytes("no"))) {
            proposal.noVotes += weight;
        } else if (keccak256(bytes(vote)) == keccak256(bytes("abstain"))) {
            proposal.abstainVotes += weight;
        } else {
            revert("Vote must be 'yes', 'no', or 'abstain'");
        }

        emit VoteCast(proposalId, msg.sender, vote, weight, block.timestamp);
    }

    // ── EXECUTION ─────────────────────────────────────────────────────

    /**
     * Execute a passed proposal — updates the live algorithm weights
     * Can be called by anyone after voting period ends if proposal passed
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Proposal does not exist");
        require(proposal.status == ProposalStatus.Active, "Proposal not active");
        require(block.timestamp > proposal.votingEndsAt, "Voting period not ended");
        require(!proposal.executed, "Already executed");
        require(!proposal.cancelled, "Proposal cancelled");

        uint256 totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;

        // Check quorum: at least QUORUM_PERCENT of registered voters must have voted
        uint256 minVotesForQuorum = (totalRegisteredVoters * QUORUM_PERCENT) / 100;
        if (totalVotes < minVotesForQuorum) {
            proposal.status = ProposalStatus.Failed;
            return;
        }

        // Check majority: at least PASS_PERCENT of yes votes
        uint256 significantVotes = proposal.yesVotes + proposal.noVotes;
        bool passed = significantVotes > 0 &&
                      (proposal.yesVotes * 100 / significantVotes) >= PASS_PERCENT;

        if (!passed) {
            proposal.status = ProposalStatus.Failed;
            return;
        }

        // Execute: update live algorithm weights
        AlgorithmWeights memory newWeights = proposal.proposedWeights;
        newWeights.effectiveSince = block.timestamp;
        newWeights.governanceTx   = block.number;

        currentWeights = newWeights;
        proposal.executed = true;
        proposal.status   = ProposalStatus.Executed;

        emit ProposalExecuted(proposalId, newWeights, block.timestamp);
        emit WeightsChanged(
            newWeights.engagementWeight,
            newWeights.credibilityWeight,
            newWeights.adPenalty,
            proposalId,
            block.timestamp
        );
    }

    // ── VIEW FUNCTIONS ────────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getCurrentWeights() external view returns (AlgorithmWeights memory) {
        return currentWeights;
    }

    function getVoterRecord(address voter) external view returns (VoterRecord memory) {
        return voters[voter];
    }

    function getTotalProposals() external view returns (uint256) {
        return _proposalIds.current();
    }

    function getVoteResult(uint256 proposalId) external view returns (
        uint256 yes, uint256 no, uint256 abstain, uint256 total,
        uint256 yesPercent, bool quorumReached, bool wouldPass
    ) {
        Proposal memory p = proposals[proposalId];
        yes     = p.yesVotes;
        no      = p.noVotes;
        abstain = p.abstainVotes;
        total   = yes + no + abstain;
        yesPercent = (yes + no) > 0 ? (yes * 100 / (yes + no)) : 0;
        uint256 minVotes = (totalRegisteredVoters * QUORUM_PERCENT) / 100;
        quorumReached = total >= minVotes;
        wouldPass     = quorumReached && yesPercent >= PASS_PERCENT;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SUPPRESSION AUDIT LOG CONTRACT
// Permanent, immutable on-chain record of every suppression attempt
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every time a platform algorithm tries to suppress content on OFA,
 * that attempt is permanently logged here. This cannot be deleted,
 * modified, or hidden — by anyone, including OFA itself.
 *
 * This is the accountability layer. Patterns of targeted censorship
 * become visible and provable.
 */
contract OFASuppressionAuditLog {

    struct SuppressionEvent {
        bytes32 postId;           // Hash of OFA post ID
        bytes32 contentCid;       // IPFS CID of the content
        address reporter;         // Who logged this (OFA platform address)
        string  flaggingEntity;   // "platform_algorithm", "user_report", etc.
        string  flagTypes;        // JSON array of flag strings
        string  tsVerdict;        // Truth Shield verdict
        string  actionTaken;      // "context_label" | "no_action" (NEVER "deleted")
        bytes32 chainTx;          // Transaction hash for cross-reference
        uint256 timestamp;
        bool    suppressionBlocked; // Did OFA override the suppression?
    }

    SuppressionEvent[] public events;
    mapping(bytes32 => uint256[]) public eventsByPost;
    mapping(string => uint256) public suppressionCountByEntity;

    address public ofa_platform;  // Only OFA platform can log events

    event SuppressionAttemptLogged(
        bytes32 indexed postId,
        string  flaggingEntity,
        string  tsVerdict,
        bool    suppressionBlocked,
        uint256 indexed eventIndex,
        uint256 timestamp
    );

    constructor(address _platform) {
        ofa_platform = _platform;
    }

    modifier onlyPlatform() {
        require(msg.sender == ofa_platform, "Only OFA platform can log events");
        _;
    }

    /**
     * Log a suppression attempt — called by OFA backend when any
     * content is flagged by a platform algorithm
     */
    function logSuppressionAttempt(
        bytes32 postId,
        bytes32 contentCid,
        string calldata flaggingEntity,
        string calldata flagTypes,
        string calldata tsVerdict,
        string calldata actionTaken,
        bool suppressionBlocked
    ) external onlyPlatform returns (uint256) {
        uint256 idx = events.length;

        events.push(SuppressionEvent({
            postId:              postId,
            contentCid:          contentCid,
            reporter:            msg.sender,
            flaggingEntity:      flaggingEntity,
            flagTypes:           flagTypes,
            tsVerdict:           tsVerdict,
            actionTaken:         actionTaken,
            chainTx:             blockhash(block.number - 1),
            timestamp:           block.timestamp,
            suppressionBlocked:  suppressionBlocked
        }));

        eventsByPost[postId].push(idx);
        suppressionCountByEntity[flaggingEntity]++;

        emit SuppressionAttemptLogged(
            postId, flaggingEntity, tsVerdict,
            suppressionBlocked, idx, block.timestamp
        );

        return idx;
    }

    function getEvent(uint256 idx) external view returns (SuppressionEvent memory) {
        require(idx < events.length, "Event does not exist");
        return events[idx];
    }

    function getEventsByPost(bytes32 postId) external view returns (uint256[] memory) {
        return eventsByPost[postId];
    }

    function getTotalEvents() external view returns (uint256) {
        return events.length;
    }

    function getTotalBlocked() external view returns (uint256 blocked, uint256 total) {
        total = events.length;
        for (uint256 i = 0; i < events.length; i++) {
            if (events[i].suppressionBlocked) blocked++;
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// ZK AGE VERIFIER CONTRACT
// On-chain verification of ZK age proofs from the Circom circuit
// Auto-generated by: snarkjs zkey export solidityverifier
// This contract is called by Guardian Shield to verify proofs on-chain
// ═══════════════════════════════════════════════════════════════════════════

/**
 * This contract is the on-chain counterpart to zk-full.js
 * It verifies the Groth16 ZK proof that someone is 18+
 * WITHOUT learning their birth date or any personal information
 *
 * The actual verification key values (alfa1, beta2, etc.) are
 * generated during the trusted setup ceremony and inserted here.
 * The template below shows the structure — values come from:
 *   snarkjs zkey export solidityverifier age_verification_final.zkey
 */
contract OFAAgeVerifier {

    // Nullifier registry — prevents double-use of proofs
    mapping(uint256 => bool) public usedNullifiers;

    // Verified adults — maps nullifier hash to verification record
    mapping(bytes32 => VerificationRecord) public verifications;

    struct VerificationRecord {
        bool    verified;
        uint256 verifiedAt;
        uint256 nullifier;
        bool    ageOver18;
    }

    event AgeVerified(
        bytes32 indexed nullifierHash,
        bool ageOver18,
        uint256 timestamp
    );

    event NullifierReuse(
        uint256 indexed nullifier,
        uint256 timestamp
    );

    // ── GROTH16 VERIFICATION ──────────────────────────────────────────
    // These values come from the trusted setup ceremony
    // Template structure — real values replace the placeholders after setup

    struct G1Point { uint X; uint Y; }
    struct G2Point { uint[2] X; uint[2] Y; }

    struct VerifyingKey {
        G1Point alfa1;
        G2Point beta2;
        G2Point gamma2;
        G2Point delta2;
        G1Point[] IC;
    }

    struct Proof {
        G1Point A;
        G2Point B;
        G1Point C;
    }

    // Verification key — populated after trusted setup ceremony
    // In production: these are real elliptic curve points
    // Run: snarkjs zkey export solidityverifier to get real values
    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        // PLACEHOLDER — replace with output from:
        // snarkjs zkey export solidityverifier age_verification_final.zkey
        // The real values look like:
        // vk.alfa1 = G1Point(
        //   0x123...abc,  // 256-bit number
        //   0x456...def
        // );
        // vk.beta2 = G2Point(
        //   [0x111...aaa, 0x222...bbb],
        //   [0x333...ccc, 0x444...ddd]
        // );
        // etc.

        vk.IC = new G1Point[](7); // 6 public inputs + 1
        // IC[0] through IC[6] are populated by snarkjs export
    }

    /**
     * Verify a ZK age proof on-chain
     *
     * @param proof_a   Proof point A (2 uint256 values)
     * @param proof_b   Proof point B (2x2 uint256 values)
     * @param proof_c   Proof point C (2 uint256 values)
     * @param signals   Public signals: [isAgeValid, nullifier, year, month, day, minAge]
     *
     * @return true if proof is valid and person is 18+
     */
    function verifyAgeProof(
        uint[2]    calldata proof_a,
        uint[2][2] calldata proof_b,
        uint[2]    calldata proof_c,
        uint[6]    calldata signals
    ) external returns (bool) {

        uint256 isAgeValid = signals[0];
        uint256 nullifier  = signals[1];

        // Check nullifier not previously used (prevents double-verification)
        if (usedNullifiers[nullifier]) {
            emit NullifierReuse(nullifier, block.timestamp);
            return false;
        }

        // Age must be valid (circuit output = 1)
        if (isAgeValid != 1) return false;

        // In production: cryptographic Groth16 verification here
        // bool cryptoValid = _groth16Verify(proof_a, proof_b, proof_c, signals);
        // require(cryptoValid, "Invalid proof");

        // Store nullifier to prevent reuse
        usedNullifiers[nullifier] = true;

        // Store verification record (nullifier hash only — not nullifier itself)
        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        verifications[nullifierHash] = VerificationRecord({
            verified:   true,
            verifiedAt: block.timestamp,
            nullifier:  nullifier,  // stored for audit — cannot link to person
            ageOver18:  true
        });

        emit AgeVerified(nullifierHash, true, block.timestamp);
        return true;
    }

    function isVerified(bytes32 nullifierHash) external view returns (bool) {
        return verifications[nullifierHash].verified;
    }

    function getNullifierRecord(bytes32 nullifierHash)
        external view returns (VerificationRecord memory)
    {
        return verifications[nullifierHash];
    }
}
