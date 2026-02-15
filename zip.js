const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

const output = fs.createWriteStream('wealthsimple-exporter.zip');
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');
  console.log('archiver has been finalized and the output file descriptor has closed.');
});

output.on('end', function() {
  console.log('Data has been drained');
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn(err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Add dist/ contents but exclude .vite directory
archive.glob('**/*', {
  cwd: 'dist/',
  ignore: ['.vite/**']
});

archive.finalize();