// Simple test script for Ads Editor CSV export
const { generateAdsEditorCsvs } = require('./dist/writers/ads-editor-csv.js');

const testClusters = [
  {
    id: 'cluster-1',
    name: 'File Converter Tools',
    use_case: 'File Conversion',
    intent: 'Transactional',
    mapped_landing_page: 'https://example.com/file-converter',
    suggested_bid: 2.5,
    keywords: [
      { keyword: 'file converter chrome', score: 0.8, suggested_bid: 2.0, source: 'seed' },
      { keyword: 'convert files online', score: 0.75, suggested_bid: 1.8, source: 'seed' }
    ],
    headlines: [
      'Chrome Extension - File Converter',
      'Convert Files Instantly',
      'Free File Conversion Tool',
      'Convert Any File Format',
      'Fast & Secure Converter'
    ],
    descriptions: [
      'Convert files directly in your browser. Fast, secure, and private file conversion.',
      'Support for 100+ file formats. No uploads needed - convert locally.',
      'Free Chrome extension for instant file conversion. Try it now!',
      'Convert documents, images, videos and more without leaving your browser.'
    ]
  }
];

const testConfig = {
  product: 'ConvertMyFile',
  pre_seeded_negatives: ['free', 'crack', 'torrent', 'pirate']
};

const testOptions = {
  product: 'convertmyfile',
  clusters: testClusters,
  productConfig: testConfig,
  outputPath: './test-output',
  markets: ['US', 'UK', 'AU']
};

console.log('Testing Ads Editor CSV Export...\n');

generateAdsEditorCsvs(testOptions)
  .then(paths => {
    console.log('✅ Success! Generated files:');
    paths.forEach(path => console.log(`  - ${path}`));
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
  });