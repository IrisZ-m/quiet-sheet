/* Anki text importer and resizable study columns. */
const COLUMN_DEFAULTS=[80,220,130,140,110,140,110,180];
let columnWidths=(()=>{try{const value=JSON.parse(localStorage.getItem('quiet-sheet-column-widths')||'null');return Array.isArray(value)&&value.length===8?value:COLUMN_DEFAULTS.slice()}catch{return COLUMN_DEFAULTS.slice()}})();
let pendingAnki=null;
const ankiDialog=document.getElementById('ankiDialog');
const ankiInput=document.getElementById('ankiFile');

function columnTemplate(){return `42px ${columnWidths.map(x=>`${Math.max(60,Math.round(x))}px`).join(' ')}`}
function installColumnResize(){
  const sheet=ws.querySelector('.sheet');if(!sheet)return;
  sheet.style.setProperty('--study-cols',columnTemplate());
  const top=sheet.querySelector('.headers');if(!top)return;
  [...top.children].slice(1).forEach((cell,index)=>{
    cell.style.position='relative';
    const handle=document.createElement('span');handle.className='colResize';handle.title='拖动调整列宽；双击自动适应';
    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();const startX=event.clientX,startWidth=columnWidths[index];handle.setPointerCapture?.(event.pointerId);document.body.classList.add('resizingColumn');
      const move=e=>{columnWidths[index]=Math.max(60,Math.min(480,startWidth+e.clientX-startX));sheet.style.setProperty('--study-cols',columnTemplate())};
      const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);document.body.classList.remove('resizingColumn');localStorage.setItem('quiet-sheet-column-widths',JSON.stringify(columnWidths))};
      addEventListener('pointermove',move);addEventListener('pointerup',up,{once:true});
    });
    handle.addEventListener('dblclick',event=>{event.stopPropagation();const rows=[...sheet.querySelectorAll('.table .row')];let width=70;rows.slice(0,250).forEach(row=>{const target=row.children[index+1];if(target)width=Math.max(width,target.scrollWidth+20)});columnWidths[index]=Math.min(480,width);sheet.style.setProperty('--study-cols',columnTemplate());localStorage.setItem('quiet-sheet-column-widths',JSON.stringify(columnWidths))});
    cell.appendChild(handle);
  });
}
const originalRenderStudy=renderStudy;
renderStudy=function(){originalRenderStudy();installColumnResize()};

function separatorFrom(value){const v=(value||'').trim().toLowerCase();return {tab:'\t',comma:',',semicolon:';',pipe:'|',colon:':',space:' '}[v]||value||''}
function countOutsideQuotes(line,char){let quoted=false,count=0;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"')i++;else quoted=!quoted}else if(!quoted&&line[i]===char)count++}return count}
function detectSeparator(line){return ['\t',',',';','|'].map(char=>[char,countOutsideQuotes(line,char)]).sort((a,b)=>b[1]-a[1])[0][1]>0?['\t',',',';','|'].map(char=>[char,countOutsideQuotes(line,char)]).sort((a,b)=>b[1]-a[1])[0][0]:'\t'}
function parseDelimited(text,separator){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(ch===separator&&!quoted){row.push(field);field=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];field=''}else field+=ch}row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);return rows}
function parseAnkiText(text){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');const lines=text.split('\n'),meta={};let start=0;
  while(start<lines.length){const line=lines[start];if(!line.trim()){start++;continue}if(!line.startsWith('#'))break;const m=line.match(/^#\s*([^:]+):(.*)$/);if(m)meta[m[1].trim().toLowerCase()]=m[2].trim();start++}
  const first=lines.slice(start).find(x=>x.trim()&&!x.startsWith('#'))||'',separator=separatorFrom(meta.separator)||detectSeparator(first),body=lines.slice(start).filter(x=>!x.startsWith('# ')).join('\n');
  let rows=parseDelimited(body,separator).filter(r=>!(r[0]||'').startsWith('#'));
  const max=Math.max(0,...rows.map(r=>r.length));rows=rows.map(r=>[...r,...Array(max-r.length).fill('')]);
  let columns=meta.columns?parseDelimited(meta.columns,separator)[0]:Array.from({length:max},(_,i)=>`字段 ${i+1}`);columns=[...columns,...Array(Math.max(0,max-columns.length)).fill('').map((_,i)=>`字段 ${columns.length+i+1}`)];
  return{rows,columns,separator,html:String(meta.html).toLowerCase()==='true',globalTags:meta.tags||'',deck:meta.deck||'',meta};
}
function sampleText(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,90)}
function suggestMappings(columns){let used=new Set();const result=columns.map(name=>{const n=name.toLowerCase();if(/guid/.test(n))return'guid';if(/tag|标签/.test(n))return'tags';if(/deck|牌组|分类/.test(n))return'deck';if(/hint|提示/.test(n))return'hint';if(/extra|补充|备注/.test(n))return'extra';if(/front|question|word|term|text|正面|问题|单词/.test(n)&&!used.has('front')){used.add('front');return'front'}if(/back|answer|meaning|definition|背面|答案|释义/.test(n)&&!used.has('back')){used.add('back');return'back'}return'ignore'});if(!result.includes('front')&&result.length)result[0]='front';if(!result.includes('back')&&result.length>1)result[1]='back';if(result.length>2&&result[2]==='ignore')result[2]='tags';return result}
function mappingOptions(value){return [['ignore','忽略'],['front','正面 / 问题'],['back','背面 / 答案'],['hint','提示'],['extra','补充说明'],['tags','标签'],['deck','牌组'],['guid','GUID']].map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}
function showAnkiDialog(parsed,fileName){
  pendingAnki={...parsed,fileName};const suggested=suggestMappings(parsed.columns),sepName=parsed.separator==='\t'?'制表符':parsed.separator;
  ankiDialog.innerHTML=`<div class="importPanel"><header><div><b>Anki 文本导入</b><small>${safe(fileName)} · ${parsed.rows.length} 条记录 · 分隔符 ${safe(sepName)}</small></div><button id="closeImport" aria-label="关闭">×</button></header><section class="importBody"><h3>1. 映射字段</h3><div class="mappingGrid">${parsed.columns.map((name,i)=>`<label><span><b>${safe(name||`字段 ${i+1}`)}</b><small>${safe(sampleText(parsed.rows[0]?.[i]))}</small></span><select data-map="${i}">${mappingOptions(suggested[i])}</select></label>`).join('')}</div><h3>2. 数据预览</h3><div class="importPreview"><table><thead><tr>${parsed.columns.map(x=>`<th>${safe(x)}</th>`).join('')}</tr></thead><tbody>${parsed.rows.slice(0,6).map(r=>`<tr>${r.map(x=>`<td>${safe(sampleText(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="importOptions"><label>重复内容 <select id="duplicateMode"><option value="update">更新已有内容</option><option value="skip">跳过重复内容</option><option value="copy">保留为副本</option></select></label><span>${parsed.html?'检测到 Anki HTML，导入时会转换为安全文本。':'内容将按纯文本导入。'}</span></div></section><footer><button id="cancelImport">取消</button><button class="primary" id="confirmImport">导入 ${parsed.rows.length} 条</button></footer></div>`;
  $('#closeImport').onclick=$('#cancelImport').onclick=()=>ankiDialog.close();$('#confirmImport').onclick=confirmAnkiImport;ankiDialog.showModal();
}
function cleanPlainLines(value){
  return String(value||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/[\u200B-\u200D\uFEFF]/g,'').split('\n').map(line=>line.replace(/[ \t]+/g,' ').trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function cleanCodeBlock(value){
  const lines=String(value||'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n');
  while(lines.length&&!lines[0].trim())lines.shift();while(lines.length&&!lines[lines.length-1].trim())lines.pop();
  const indents=lines.filter(line=>line.trim()).map(line=>(line.match(/^ */)||[''])[0].length),indent=indents.length?Math.min(...indents):0;
  return lines.map(line=>line.slice(indent).replace(/\s+$/,'')).join('\n');
}
function plainContent(value,allowHtml){
  let text=String(value||'').replace(/\[sound:[^\]]+\]/gi,'');
  if(!(allowHtml||/<\/?[a-z][\s\S]*>/i.test(text)))return cleanPlainLines(text);
  const doc=new DOMParser().parseFromString(text.replace(/<!--[\s\S]*?-->/g,''),'text/html'),codeBlocks=[];
  doc.querySelectorAll('script,style,link,iframe,object,embed,audio,video,source,img,svg,canvas,form,input,button,select,textarea,noscript,template').forEach(node=>node.remove());
  doc.querySelectorAll('pre').forEach(node=>{const token=`\uE000QS_PRE_${codeBlocks.length}\uE001`;codeBlocks.push(cleanCodeBlock(node.textContent));node.replaceWith(doc.createTextNode(`\n${token}\n`))});
  doc.querySelectorAll('ruby').forEach(node=>{const readings=[...node.querySelectorAll('rt')].map(x=>cleanPlainLines(x.textContent)).filter(Boolean);node.querySelectorAll('rt,rp').forEach(x=>x.remove());const base=cleanPlainLines(node.textContent),reading=readings.join('、');node.replaceWith(doc.createTextNode(base+(reading?`（${reading}）`:'')))});
  doc.querySelectorAll('table').forEach(table=>{const rows=[...table.querySelectorAll('tr')].map(row=>[...row.querySelectorAll(':scope > th,:scope > td')].map(cell=>cleanPlainLines(cell.textContent).replace(/\n+/g,' / ')).filter(Boolean).join(' ｜ ')).filter(Boolean);table.replaceWith(doc.createTextNode(`\n${rows.join('\n')}\n`))});
  doc.querySelectorAll('li').forEach(item=>{const list=item.parentElement,items=list?[...list.children].filter(x=>x.tagName==='LI'):[],marker=list&&list.tagName==='OL'?`${items.indexOf(item)+1}. `:'• ';item.insertBefore(doc.createTextNode(marker),item.firstChild)});
  doc.querySelectorAll('dt').forEach(node=>node.append(doc.createTextNode('：')));
  doc.querySelectorAll('sup').forEach(node=>node.replaceWith(doc.createTextNode(`^(${cleanPlainLines(node.textContent)})`)));
  doc.querySelectorAll('sub').forEach(node=>node.replaceWith(doc.createTextNode(`_(${cleanPlainLines(node.textContent)})`)));
  doc.querySelectorAll('br').forEach(node=>node.replaceWith(doc.createTextNode('\n')));
  doc.querySelectorAll('hr').forEach(node=>node.replaceWith(doc.createTextNode('\n——\n')));
  doc.querySelectorAll('p,div,section,article,header,footer,main,aside,h1,h2,h3,h4,h5,h6,li,blockquote,details,summary,dt,dd').forEach(node=>node.append(doc.createTextNode('\n')));
  text=cleanPlainLines(doc.body.textContent||'');
  codeBlocks.forEach((block,index)=>{text=text.replace(`\uE000QS_PRE_${index}\uE001`,block)});
  return text.trim();
}
function clozeContent(front){const answers=[];const display=front.replace(/\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/gi,(_,answer,hint)=>{answers.push(answer);return`[${hint||'…'}]`});return{display,answers}}
function cardId(front,deck,guid){if(guid)return`anki:${guid}`;let hash=2166136261;for(const ch of `${deck}|${front}`){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}return`anki:${(hash>>>0).toString(36)}`}
function openCardDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('quiet-sheet-data',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('cards'))req.result.createObjectStore('cards',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbReadCards(){try{const db=await openCardDb();return await new Promise((resolve,reject)=>{const req=db.transaction('cards').objectStore('cards').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}catch{try{return JSON.parse(localStorage.getItem('quiet-sheet-imported-cards')||'[]')}catch{return[]}}}
async function dbWriteCards(cards){try{const db=await openCardDb();await new Promise((resolve,reject)=>{const tx=db.transaction('cards','readwrite'),store=tx.objectStore('cards');store.clear();cards.forEach(card=>store.put(card));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch{localStorage.setItem('quiet-sheet-imported-cards',JSON.stringify(cards))}}
function importedOnly(){return words.filter(x=>x.source==='anki')}
const hiddenBuiltinsKey='quiet-sheet-hidden-builtins';
function localCardKey(card){return card?.id||`builtin:${card?.word||''}`}
function hiddenBuiltinIds(){try{return new Set(JSON.parse(localStorage.getItem(hiddenBuiltinsKey)||'[]'))}catch{return new Set()}}
function applyHiddenBuiltins(){const hidden=hiddenBuiltinIds();if(!hidden.size)return;const kept=words.filter(card=>card.source==='anki'||!hidden.has(localCardKey(card)));words.splice(0,words.length,...kept)}
async function deleteLocalCards(ids){
  const removed=new Set(ids),hidden=hiddenBuiltinIds(),keptBuiltins=[];
  words.filter(card=>card.source!=='anki').forEach(card=>{const id=localCardKey(card);if(removed.has(id))hidden.add(id);else keptBuiltins.push(card)});
  const keptImported=importedOnly().filter(card=>!removed.has(localCardKey(card)));
  await dbWriteCards(keptImported);localStorage.setItem(hiddenBuiltinsKey,JSON.stringify([...hidden]));
  removed.forEach(id=>{delete progress[id];if(id.startsWith('builtin:'))delete progress[id.slice(8)]});localStorage.setItem('quiet-sheet-progress',JSON.stringify(progress));
  words.splice(0,words.length,...keptBuiltins,...keptImported);updateWordCounts();
}
window.qsLocalCardKey=localCardKey;window.qsDeleteLocalCards=deleteLocalCards;applyHiddenBuiltins();
function replaceImported(cards){const builtins=words.filter(x=>x.source!=='anki');words.splice(0,words.length,...builtins,...cards);updateWordCounts()}
function updateWordCounts(){document.querySelectorAll('.tools [data-view="library"] small').forEach(x=>x.textContent=`${words.length} 条`)}
async function confirmAnkiImport(){
  if(!pendingAnki)return;const maps=[...ankiDialog.querySelectorAll('[data-map]')].map(x=>x.value),frontIndex=maps.indexOf('front');if(frontIndex<0){alert('请至少指定一列作为“正面 / 问题”。');return}const mode=$('#duplicateMode').value,existing=importedOnly(),byId=new Map(existing.map(x=>[x.id,x])),created=[];
  for(const row of pendingAnki.rows){const pick=key=>maps.map((m,i)=>m===key?row[i]:'').filter(Boolean).join(' · ');let front=plainContent(pick('front'),pendingAnki.html),back=plainContent(pick('back'),pendingAnki.html),hint=plainContent(pick('hint'),pendingAnki.html),extra=plainContent(pick('extra'),pendingAnki.html),tags=[pendingAnki.globalTags,plainContent(pick('tags'),false)].filter(Boolean).join(' ').trim(),deck=plainContent(pick('deck'),false)||pendingAnki.deck||'Anki 导入',guid=plainContent(pick('guid'),false);if(!front)continue;const cloze=clozeContent(front);front=cloze.display;if(cloze.answers.length)back=[cloze.answers.join('；'),back].filter(Boolean).join('\n');const baseId=cardId(front,deck,guid);let id=baseId;if(byId.has(baseId)&&mode==='skip')continue;if(mode==='copy'&&byId.has(id))id=`${baseId}:${Date.now().toString(36)}:${created.length}`;const card={id,word:front,sound:'',meaning:back||'（未提供答案）',kind:'导入',example:[hint,extra,tags?`标签：${tags}`:''].filter(Boolean).join('\n'),deck,tags,source:'anki'};byId.set(id,card);created.push(card)
  }
  const all=[...byId.values()];await dbWriteCards(all);replaceImported(all);filter='导入';selected=0;revealed=false;view='library';cover=false;ankiDialog.close();render();alert(`已导入 ${created.length} 条卡片。`)
}

$('#importAnki').onclick=()=>ankiInput.click();
const ankiSoftLimit=12*1024*1024,ankiHardLimit=50*1024*1024,importState=document.getElementById('importState');
function setImportState(text){if(importState)importState.textContent=text}
ankiInput.onchange=event=>{
  const file=event.target.files?.[0];if(!file)return;const sizeMb=(file.size/1024/1024).toFixed(1);
  if(file.size>ankiHardLimit){alert(`文件为 ${sizeMb}MB，超过当前 50MB 上限。请按牌组或标签拆分后导入。`);setImportState('超过 50MB');event.target.value='';return}
  if(file.size>ankiSoftLimit&&!confirm(`文件为 ${sizeMb}MB，解析期间页面可能短暂无响应。\n是否继续读取？`)){setImportState('已取消');event.target.value='';return}
  const reader=new FileReader();setImportState(`正在读取 0%`);
  reader.onprogress=progress=>{if(progress.lengthComputable)setImportState(`正在读取 ${Math.min(100,Math.round(progress.loaded/progress.total*100))}%`)};
  reader.onerror=()=>{setImportState('读取失败');alert('无法读取文件，请确认文件未被占用。')};
  reader.onload=()=>{setImportState('正在解析…');requestAnimationFrame(()=>setTimeout(()=>{try{const text=String(reader.result||'');if(text.includes('\uFFFD'))alert('文件中出现无法识别的字符，请确认它使用 UTF-8 编码。');const parsed=parseAnkiText(text);if(!parsed.rows.length)throw new Error('没有可导入的记录');setImportState(`已识别 ${parsed.rows.length.toLocaleString()} 条`);showAnkiDialog(parsed,file.name)}catch(error){setImportState('解析失败');alert(`无法解析文件：${error.message}`)}},20))};
  reader.readAsText(file,'utf-8');event.target.value='';
};

window.qsCardsLoaded=false;dbReadCards().then(cards=>{replaceImported(cards);window.qsCardsLoaded=true;render()});
