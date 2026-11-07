// Run: node tests/sprint-layout-regression.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const sections={
  base:html.split('@media(orientation:portrait)')[0],
  portrait:html.split('@media(orientation:portrait)')[1].split('@media(orientation:landscape)')[0],
  landscape:html.split('@media(orientation:landscape)')[1].split('</style>')[0]
};
function style(section,id){
  const matches=[...section.matchAll(new RegExp('#'+id+'\{([^}]*)\}','g'))];
  assert.equal(matches.length,1,'Expected one '+id+' rule');
  return Object.fromEntries([...matches[0][1].matchAll(/([\w-]+):([^;}]*)/g)].map(([,k,v])=>[k,v.trim()]));
}
for(const [name,section] of Object.entries(sections)){
  const sprint=style(section,'sprint');
  const fire=style(section,'fire');
  const reload=style(section,'reload');
  const jump=style(section,'jump');
  assert.ok(sprint.right,'Sprint must be on the right in '+name);
  assert.ok(!sprint.left,'Sprint must not anchor to the left in '+name);
  const rect=css=>({left:-parseInt(css.right)-parseInt(css.width),right:-parseInt(css.right),bottom:parseInt(css.bottom),top:parseInt(css.bottom)+parseInt(css.height)});
  const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.bottom<b.top&&a.top>b.bottom;
  for(const [id,other] of [['fire',fire],['reload',reload],['jump',jump]])
    assert.ok(!overlaps(rect(sprint),rect(other)),name+' sprint overlaps '+id);
}
assert.match(html,/<button id="sprint">SPRINT<\/button>/);
console.log('Sprint layout checks passed for base, portrait and landscape.');
