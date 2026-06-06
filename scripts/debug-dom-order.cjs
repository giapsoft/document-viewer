const fs = require('fs');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('D:/Temp/alerts-2/docs/be-tsd.tsd02.md', 'utf8');
const html = marked.parse(source);
const dom = new JSDOM(`<div id="root">${html}</div>`);
const root = dom.window.document.getElementById('root');

const preCodes = Array.from(root.querySelectorAll('pre > code'));
console.log('pre>code count:', preCodes.length);
preCodes.forEach((el, i) => {
  // Find its position in the full HTML
  const text = el.textContent || '';
  const htmlIdx = html.indexOf('<pre>');
  console.log(`\npreCode[${i}]:`);
  console.log('  first 80:', JSON.stringify(text.slice(0, 80)));
  // Check if this element is inside a table
  const inTable = !!el.closest('table');
  console.log('  inTable:', inTable);
  if (inTable) {
    const td = el.closest('td');
    console.log('  td content:', JSON.stringify(td?.textContent?.slice(0, 80)));
  }
});

// Also find where in HTML the pre blocks appear
console.log('\n--- All <pre> positions in rendered HTML ---');
let idx = 0;
let num = 0;
while(true) {
  const f = html.indexOf('<pre>', idx);
  if(f<0) break;
  const end = html.indexOf('</pre>', f);
  const content = html.slice(f, Math.min(f+100, end));
  console.log(`pre[${num++}] at html pos ${f}: ${JSON.stringify(content)}`);
  idx = f+1;
}
