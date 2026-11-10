const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const ids = ['move', 'fire', 'jump', 'reload', 'sprint', 'pause'];
const sizes = {
  portrait: { move:[112,112], fire:[82,82], jump:[58,58], reload:[51,51], sprint:[50,50], pause:[42,42] },
  landscape:{ move:[116,116], fire:[84,84], jump:[58,58], reload:[50,50], sprint:[50,50], pause:[42,42] }
};
const block = orientation => {
  const start = html.lastIndexOf('@media(orientation:' + orientation + ')');
  assert.ok(start >= 0, orientation + ' media rule missing');
  return html.slice(start, html.indexOf('\n}', start) + 2);
};
function rectangle(orientation, id, viewport, safe) {
  const css = block(orientation);
  const match = css.match(new RegExp('#' + id + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, orientation + ' #' + id + ' rule missing');
  const props = Object.fromEntries([...match[1].matchAll(/(left|right|top|bottom):calc\\((\\d+)px \\+ env\\(safe-area-inset-(left|right|top|bottom)\\)\\)/g)].map(m => [m[1], { offset:Number(m[2]), inset:m[3] }]));
  const horizontal = props.left ? 'left' : 'right';
  const vertical = props.top ? 'top' : 'bottom';
  assert.ok(props[horizontal] && props[vertical], id + ' safe-area axes missing');
  assert.equal(props[horizontal].inset, horizontal);
  assert.equal(props[vertical].inset, vertical);
  const [width,height] = sizes[orientation][id];
  const x = horizontal === 'left' ? props.left.offset + safe.left : viewport.width - props.right.offset - safe.right - width;
  const y = vertical === 'top' ? props.top.offset + safe.top : viewport.height - props.bottom.offset - safe.bottom - height;
  return { x,y,width,height };
}
function intersects(a,b) {
  return Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x) &&
    Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
}
test('all six touch controls respect safe areas without overlap at mobile viewport sizes', () => {
  assert.match(html, /viewport-fit=cover/);
  const cases = [
    ['portrait',390,844,{left:0,right:0,top:59,bottom:34}],
    ['portrait',320,568,{left:0,right:0,top:20,bottom:20}],
    ['landscape',844,390,{left:59,right:59,top:0,bottom:21}],
    ['landscape',667,375,{left:44,right:44,top:0,bottom:21}]
  ];
  for (const [orientation,width,height,safe] of cases) {
    const rectangles = ids.map(id => [id,rectangle(orientation,id,{width,height},safe)]);
    for (const [id,r] of rectangles)
      assert.ok(r.x>=0 && r.y>=0 && r.x+r.width<=width && r.y+r.height<=height,
        orientation + ' ' + width + ' #' + id + ' outside viewport');
    for (let i=0;i<rectangles.length;i++)
      for (let j=i+1;j<rectangles.length;j++)
        assert.equal(intersects(rectangles[i][1],rectangles[j][1]),false,
          orientation + ' ' + width + ' ' + rectangles[i][0] + '/' + rectangles[j][0] + ' overlap');
  }
});
