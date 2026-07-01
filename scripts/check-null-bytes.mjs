import fs from 'fs';

const path = process.argv[2];
const buf = fs.readFileSync(path);
let count = 0;
let firstIdx = -1;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0) {
    count++;
    if (firstIdx === -1) firstIdx = i;
  }
}
console.log('Length:', buf.length);
console.log('Null bytes:', count);
if (firstIdx !== -1) {
  console.log('First null byte at position:', firstIdx);
  console.log('Context:', buf.slice(Math.max(0, firstIdx - 50), firstIdx + 50).toString('utf8').replace(/\0/g, '[NULL]'));
}
