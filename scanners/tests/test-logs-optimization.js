#!/usr/bin/env node
/**
 * Test script for logs optimization features
 * Tests Phase 1-4 implementations
 */

const { LOGS_OPTIMIZATION, getLogsOptimization } = require('../config/networks.js');

console.log('🧪 Testing getLogs Optimization Features\n');

// Test 1: Verify LOGS_OPTIMIZATION profiles exist
console.log('═══════════════════════════════════════');
console.log('Test 1: Verify LOGS_OPTIMIZATION Profiles');
console.log('═══════════════════════════════════════');

const expectedProfiles = [
  // Free tier
  'high-activity-free',
  'medium-activity-free',
  'low-activity-free',
  // PAYG tier
  'high-activity-payg',
  'medium-activity-payg',
  'low-activity-payg',
  // Premium tier
  'high-activity-premium',
  'medium-activity-premium',
  'low-activity-premium',
  // Density-based
  'ultra-high-density-free',
  'ultra-high-density-payg',
  'ultra-high-density-premium',
  'high-density-free',
  'high-density-payg',
  'high-density-premium',
  'medium-density-free',
  'medium-density-payg',
  'medium-density-premium',
  'low-density-free',
  'low-density-payg',
  'low-density-premium',
  // Legacy
  'high-activity',
  'medium-activity',
  'low-activity'
];

let missingProfiles = [];
let passedProfiles = 0;

expectedProfiles.forEach(profile => {
  if (LOGS_OPTIMIZATION[profile]) {
    passedProfiles++;
    console.log(`✅ ${profile}`);
  } else {
    missingProfiles.push(profile);
    console.log(`❌ ${profile} - MISSING`);
  }
});

console.log(`\nResult: ${passedProfiles}/${expectedProfiles.length} profiles found`);
if (missingProfiles.length === 0) {
  console.log('✅ Test 1 PASSED\n');
} else {
  console.log(`❌ Test 1 FAILED - Missing: ${missingProfiles.join(', ')}\n`);
}

// Test 2: Verify targetLogsPerRequest is under 10K limit
console.log('═══════════════════════════════════════');
console.log('Test 2: Verify 10K Log Limit Compliance');
console.log('═══════════════════════════════════════');

let exceedingProfiles = [];
let compliantProfiles = 0;

Object.entries(LOGS_OPTIMIZATION).forEach(([name, config]) => {
  if (config.targetLogsPerRequest <= 9000) {
    compliantProfiles++;
    console.log(`✅ ${name}: ${config.targetLogsPerRequest} logs`);
  } else {
    exceedingProfiles.push({ name, target: config.targetLogsPerRequest });
    console.log(`❌ ${name}: ${config.targetLogsPerRequest} logs - EXCEEDS LIMIT`);
  }
});

console.log(`\nResult: ${compliantProfiles}/${Object.keys(LOGS_OPTIMIZATION).length} profiles compliant`);
if (exceedingProfiles.length === 0) {
  console.log('✅ Test 2 PASSED\n');
} else {
  console.log(`❌ Test 2 FAILED - ${exceedingProfiles.length} profiles exceed limit\n`);
}

// Test 3: Test getLogsOptimization helper function
console.log('═══════════════════════════════════════');
console.log('Test 3: Test getLogsOptimization()');
console.log('═══════════════════════════════════════');

const testCases = [
  { activity: 'high-activity', tier: 'free', expected: 'high-activity-free' },
  { activity: 'high-activity', tier: 'payg', expected: 'high-activity-payg' },
  { activity: 'medium-activity', tier: 'premium', expected: 'medium-activity-premium' },
  { activity: 'low-activity', tier: 'free', expected: 'low-activity-free' },
  { activity: 'ultra-high-density', tier: 'payg', expected: 'ultra-high-density-payg' },
];

let helperPassed = 0;
let helperFailed = 0;

testCases.forEach(test => {
  const result = getLogsOptimization(test.activity, test.tier);
  const expectedConfig = LOGS_OPTIMIZATION[test.expected];

  if (result === expectedConfig) {
    helperPassed++;
    console.log(`✅ ${test.activity} + ${test.tier} → ${test.expected}`);
  } else {
    helperFailed++;
    console.log(`❌ ${test.activity} + ${test.tier} → Expected ${test.expected}`);
  }
});

console.log(`\nResult: ${helperPassed}/${testCases.length} cases passed`);
if (helperFailed === 0) {
  console.log('✅ Test 3 PASSED\n');
} else {
  console.log(`❌ Test 3 FAILED - ${helperFailed} cases failed\n`);
}

// Test 4: Verify Free tier constraints
console.log('═══════════════════════════════════════');
console.log('Test 4: Verify Free Tier Constraints');
console.log('═══════════════════════════════════════');

const freeProfiles = Object.entries(LOGS_OPTIMIZATION)
  .filter(([name]) => name.includes('-free'));

let freeConstraintsPassed = 0;
let freeConstraintsFailed = 0;

freeProfiles.forEach(([name, config]) => {
  const issues = [];

  if (config.initialBatchSize !== 10) issues.push(`initialBatchSize=${config.initialBatchSize}`);
  if (config.minBatchSize !== 10) issues.push(`minBatchSize=${config.minBatchSize}`);
  if (config.maxBatchSize !== 10) issues.push(`maxBatchSize=${config.maxBatchSize}`);
  if (config.fastMultiplier !== 1.0) issues.push(`fastMultiplier=${config.fastMultiplier}`);
  if (config.slowMultiplier !== 1.0) issues.push(`slowMultiplier=${config.slowMultiplier}`);

  if (issues.length === 0) {
    freeConstraintsPassed++;
    console.log(`✅ ${name}: All constraints met`);
  } else {
    freeConstraintsFailed++;
    console.log(`❌ ${name}: ${issues.join(', ')}`);
  }
});

console.log(`\nResult: ${freeConstraintsPassed}/${freeProfiles.length} free profiles correct`);
if (freeConstraintsFailed === 0) {
  console.log('✅ Test 4 PASSED\n');
} else {
  console.log(`❌ Test 4 FAILED - ${freeConstraintsFailed} profiles incorrect\n`);
}

// Test 5: Verify density-based batch sizes
console.log('═══════════════════════════════════════');
console.log('Test 5: Verify Density-Based Batch Sizes');
console.log('═══════════════════════════════════════');

const densityTests = [
  { profile: 'ultra-high-density-payg', maxExpected: 200, desc: 'Ultra-high should have small max' },
  { profile: 'high-density-payg', maxExpected: 1000, desc: 'High should have moderate max' },
  { profile: 'medium-density-payg', maxExpected: 3000, desc: 'Medium should have larger max' },
  { profile: 'low-density-payg', maxExpected: 10000, desc: 'Low should have very large max' },
];

let densityPassed = 0;
let densityFailed = 0;

densityTests.forEach(test => {
  const config = LOGS_OPTIMIZATION[test.profile];
  if (config && config.maxBatchSize <= test.maxExpected) {
    densityPassed++;
    console.log(`✅ ${test.profile}: maxBatch=${config.maxBatchSize} (${test.desc})`);
  } else {
    densityFailed++;
    const actual = config ? config.maxBatchSize : 'N/A';
    console.log(`❌ ${test.profile}: maxBatch=${actual}, expected ≤${test.maxExpected}`);
  }
});

console.log(`\nResult: ${densityPassed}/${densityTests.length} density tests passed`);
if (densityFailed === 0) {
  console.log('✅ Test 5 PASSED\n');
} else {
  console.log(`❌ Test 5 FAILED\n`);
}

// Summary
console.log('═══════════════════════════════════════');
console.log('📊 TEST SUMMARY');
console.log('═══════════════════════════════════════');

const allTests = [
  { name: 'Profile Existence', passed: missingProfiles.length === 0 },
  { name: '10K Limit Compliance', passed: exceedingProfiles.length === 0 },
  { name: 'Helper Function', passed: helperFailed === 0 },
  { name: 'Free Tier Constraints', passed: freeConstraintsFailed === 0 },
  { name: 'Density-Based Sizes', passed: densityFailed === 0 },
];

const totalPassed = allTests.filter(t => t.passed).length;
const totalTests = allTests.length;

allTests.forEach(test => {
  const status = test.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${test.name}`);
});

console.log(`\n${'='.repeat(39)}`);
console.log(`Total: ${totalPassed}/${totalTests} tests passed`);

if (totalPassed === totalTests) {
  console.log('🎉 ALL TESTS PASSED!');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED');
  process.exit(1);
}
