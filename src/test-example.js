// Test file for Phase 2 verification

function getData() {
    console.log('Getting data...');  // Added logging
    const data = [1, 2, 3, 4, 5];
    return data;
}

function processData(data) {
    console.log('Processing data...');  // Added logging
    return data.map(x => x * 2);
}

function saveData(data) {
    console.log('Saving data...');  // Added logging
    // Simulate save
    return true;
}

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { getData, processData, saveData };
}
