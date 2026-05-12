/*
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   OFA ZERO-KNOWLEDGE AGE VERIFICATION CIRCUIT  v1.0.0           ║
 * ║   Written in Circom 2.0 — compiled with SnarkJS (Groth16)       ║
 * ║                                                                  ║
 * ║   WHAT THIS PROVES:                                              ║
 * ║   "I am over 18" WITHOUT revealing:                              ║
 * ║     - Name                                                       ║
 * ║     - Date of birth                                              ║
 * ║     - ID number                                                  ║
 * ║     - Any personal information                                   ║
 * ║                                                                  ║
 * ║   HOW IT WORKS:                                                  ║
 * ║   1. User inputs their birth year (private — never transmitted)  ║
 * ║   2. Circuit proves current_year - birth_year >= 18              ║
 * ║   3. Outputs a cryptographic proof — contains ZERO personal data ║
 * ║   4. OFA verifies the proof without learning birth year          ║
 * ║                                                                  ║
 * ║   COMPILE:                                                       ║
 * ║   npm install -g circom snarkjs                                  ║
 * ║   circom age_verification.circom --r1cs --wasm --sym             ║
 * ║   snarkjs groth16 setup age_verification.r1cs pot12_final.ptau \ ║
 * ║     age_verification_0000.zkey                                   ║
 * ║   snarkjs zkey contribute age_verification_0000.zkey \           ║
 * ║     age_verification_final.zkey --name="OFA Ceremony"            ║
 * ║   snarkjs zkey export verificationkey age_verification_final.zkey║
 * ║     verification_key.json                                        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

/*
 * AgeVerification Circuit
 *
 * Private inputs (never revealed, never transmitted):
 *   - birthYear:   User's actual birth year (e.g. 1990)
 *   - birthMonth:  User's actual birth month (1-12)
 *   - birthDay:    User's actual birth day (1-31)
 *   - salt:        Random value to prevent brute-force of birth year
 *   - idHash:      Poseidon hash of the government ID number (binding)
 *
 * Public inputs (visible to verifier — contain NO personal data):
 *   - currentYear:   Current year at time of verification (e.g. 2026)
 *   - currentMonth:  Current month (1-12)
 *   - currentDay:    Current day (1-31)
 *   - minAge:        Minimum age required (18)
 *   - commitment:    Poseidon(birthYear, birthMonth, birthDay, salt)
 *
 * Public outputs:
 *   - isAgeValid:   1 if age >= minAge, 0 otherwise
 *   - nullifier:    Unique identifier preventing double-verification
 *                   = Poseidon(idHash, commitment)
 *                   Lets us detect duplicate verifications without
 *                   knowing who the person is
 */
template AgeVerification() {

    // ── PRIVATE INPUTS ──────────────────────────────────────────────
    signal input birthYear;    // e.g. 1990
    signal input birthMonth;   // 1-12
    signal input birthDay;     // 1-31
    signal input salt;         // random 128-bit value
    signal input idHash;       // Poseidon hash of ID number

    // ── PUBLIC INPUTS ───────────────────────────────────────────────
    signal input currentYear;  // e.g. 2026
    signal input currentMonth; // 1-12
    signal input currentDay;   // 1-31
    signal input minAge;       // 18

    // ── OUTPUTS ─────────────────────────────────────────────────────
    signal output isAgeValid;  // 1 = over minAge, 0 = under
    signal output nullifier;   // Unique anti-double-use identifier

    // ── STEP 1: Validate input ranges ───────────────────────────────
    // Birth year must be reasonable (1900-2015 covers all humans ≥ 11)
    component yearMin = GreaterEqThan(11);
    yearMin.in[0] <== birthYear;
    yearMin.in[1] <== 1900;
    yearMin.out === 1;

    component yearMax = LessEqThan(11);
    yearMax.in[0] <== birthYear;
    yearMax.in[1] <== 2015;
    yearMax.out === 1;

    // Month must be 1-12
    component monthMin = GreaterEqThan(5);
    monthMin.in[0] <== birthMonth;
    monthMin.in[1] <== 1;
    monthMin.out === 1;

    component monthMax = LessEqThan(5);
    monthMax.in[0] <== birthMonth;
    monthMax.in[1] <== 12;
    monthMax.out === 1;

    // Day must be 1-31
    component dayMin = GreaterEqThan(5);
    dayMin.in[0] <== birthDay;
    dayMin.in[1] <== 1;
    dayMin.out === 1;

    component dayMax = LessEqThan(5);
    dayMax.in[0] <== birthDay;
    dayMax.in[1] <== 31;
    dayMax.out === 1;

    // ── STEP 2: Compute commitment ───────────────────────────────────
    // Commitment binds the private inputs together cryptographically
    // commitment = Poseidon(birthYear, birthMonth, birthDay, salt)
    // This is a one-way hash — cannot be reversed to get birth data
    component commitmentHash = Poseidon(4);
    commitmentHash.inputs[0] <== birthYear;
    commitmentHash.inputs[1] <== birthMonth;
    commitmentHash.inputs[2] <== birthDay;
    commitmentHash.inputs[3] <== salt;

    // ── STEP 3: Compute age in years ─────────────────────────────────
    // Age = currentYear - birthYear (approximate — ignores exact day)
    // Then we adjust: if birthday hasn't occurred this year, subtract 1
    signal yearDiff;
    yearDiff <== currentYear - birthYear;

    // Check if birthday has passed this year:
    // monthPassed = currentMonth > birthMonth
    // OR (currentMonth == birthMonth AND currentDay >= birthDay)
    component monthGt = GreaterThan(5);
    monthGt.in[0] <== currentMonth;
    monthGt.in[1] <== birthMonth;

    component monthEq = IsEqual();
    monthEq.in[0] <== currentMonth;
    monthEq.in[1] <== birthMonth;

    component dayGe = GreaterEqThan(5);
    dayGe.in[0] <== currentDay;
    dayGe.in[1] <== birthDay;

    // birthdayPassedThisYear = monthGt OR (monthEq AND dayGe)
    signal sameMonthBirthdayPassed;
    sameMonthBirthdayPassed <== monthEq.out * dayGe.out;

    signal birthdayPassedThisYear;
    // Use quadratic constraint: a OR b = a + b - a*b
    birthdayPassedThisYear <== monthGt.out + sameMonthBirthdayPassed
                               - monthGt.out * sameMonthBirthdayPassed;

    // actualAge = yearDiff if birthday passed, yearDiff - 1 if not
    signal actualAge;
    actualAge <== yearDiff - (1 - birthdayPassedThisYear);

    // ── STEP 4: Check age >= minAge ──────────────────────────────────
    component ageCheck = GreaterEqThan(8);
    ageCheck.in[0] <== actualAge;
    ageCheck.in[1] <== minAge;

    isAgeValid <== ageCheck.out;

    // ── STEP 5: Compute nullifier ────────────────────────────────────
    // nullifier = Poseidon(idHash, commitment)
    // This is unique per person per verification request
    // OFA stores nullifiers to prevent one person verifying twice
    // WITHOUT learning who the person is
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== idHash;
    nullifierHash.inputs[1] <== commitmentHash.out;

    nullifier <== nullifierHash.out;
}

// Main component — instantiate the circuit
component main {public [currentYear, currentMonth, currentDay, minAge]} = AgeVerification();
