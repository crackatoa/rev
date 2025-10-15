const download = require('./utils/download');

// Example: Download a file
function downloadExample() {
  // Download a sample file
  download('https://httpbin.org/json', 'sample.json');
}

// Call the example
downloadExample();
