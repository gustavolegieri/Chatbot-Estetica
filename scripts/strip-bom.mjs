import fs from 'fs';

const path = process.argv[2];
let buf = fs.readFileSync(path);

// Check for UTF-8 BOM (EF BB BF)
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  buf = buf.slice(3);
  fs.writeFileSync(path, buf);
  console.log('BOM stripped successfully');
} else {
  console.log('No BOM found');
}
