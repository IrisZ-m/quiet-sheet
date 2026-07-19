/* Spreadsheet-style card management: search, paging, selection, editing and bulk actions. */
const STUDY_PAGE_SIZE=150;
let studyPage=0,studySelection=new Set(),studyAnchor=-1,searchTimer=0;
window.studySearchQuery='';
window.qsManageMode=false;
window.qsSyncManageButton=function(){
  const button=document.getElementById('manageCards');if(!button)return;
  button.classList.toggle('active',window.qsManageMode);
  button.title=window.qsManageMode?'退出资料管理并恢复行号':'多选、修改分类或删除已导入的卡片';
  button.innerHTML=window.qsManageMode?'<b>↩</b>退出管理<small>恢复行号</small>':'<b>☑</b>资料管理<small>多选 / 删除</small>';
};
window.studyMatches=card=>{
  const query=String(window.studySearchQuery||'').trim().toLocaleLowerCase();
  if(!query)return true;
  const text=[card.word,card.meaning,card.deck,card.tags,card.example,card.kind].filter(Boolean).join(' ').toLocaleLowerCase();
  return query.split(/\s+/).every(term=>text.includes(term));
};
function managerCategories(){return [...new Set(importedOnly().map(card=>card.deck||'Anki 导入'))].sort((a,b)=>a.localeCompare(b,'zh-CN'))}
function managerCardKey(card){return card?.id||`builtin:${card?.word||''}`}
function saveProgressAfterDelete(ids){ids.forEach(id=>delete progress[id]);localStorage.setItem('quiet-sheet-progress',JSON.stringify(progress))}
async function persistImportedCards(cards){await dbWriteCards(cards);replaceImported(cards)}
function ensureEditDialog(){let dialog=document.getElementById('cardEditDialog');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='cardEditDialog';dialog.className='cardEditDialog';document.body.appendChild(dialog);return dialog}
function editCard(card){
  if(!card||card.source!=='anki')return;
  const dialog=ensureEditDialog(),categories=managerCategories();
  dialog.innerHTML=`<form method="dialog" class="cardEditPanel"><header><div><b>编辑项目记录</b><small>修改内容会自动保存在当前浏览器</small></div><button value="cancel" aria-label="关闭">×</button></header><section><label><span>正面 / 问题</span><textarea id="editFront" rows="3">${safe(card.word)}</textarea></label><label><span>背面 / 答案</span><textarea id="editBack" rows="6">${safe(card.meaning)}</textarea></label><div class="editGrid"><label><span>分类 / 牌组</span><input id="editDeck" value="${safe(card.deck||'Anki 导入')}" list="managerCategoryList"></label><label><span>标签</span><input id="editTags" value="${safe(card.tags||'')}"></label></div><label><span>补充说明</span><textarea id="editExtra" rows="3">${safe(card.example||'')}</textarea></label><datalist id="managerCategoryList">${categories.map(x=>`<option value="${safe(x)}">`).join('')}</datalist></section><footer><button value="cancel">取消</button><button type="button" class="primary" id="saveCardEdit">保存修改</button></footer></form>`;
  dialog.querySelector('#saveCardEdit').onclick=async()=>{
    const position=window.qsCaptureStudyPosition?.(),front=dialog.querySelector('#editFront').value.trim(),back=dialog.querySelector('#editBack').value.trim(),deck=dialog.querySelector('#editDeck').value.trim();
    if(!front){alert('“正面 / 问题”不能为空。');return}
    card.word=front;card.meaning=back||'（未提供答案）';card.deck=deck||'Anki 导入';card.tags=dialog.querySelector('#editTags').value.trim();card.example=dialog.querySelector('#editExtra').value.trim();card.updatedAt=new Date().toISOString();
    await persistImportedCards(importedOnly());dialog.close();render();window.qsRestoreStudyPosition?.(position);
  };
  dialog.showModal();requestAnimationFrame(()=>dialog.querySelector('#editFront')?.focus());
}
function selectManagedCard(id,index,event){
  if(event.shiftKey&&studyAnchor>=0){
    const list=visible(),from=Math.min(studyAnchor,index),to=Math.max(studyAnchor,index);
    if(!event.ctrlKey&&!event.metaKey)studySelection.clear();
    list.slice(from,to+1).forEach(card=>studySelection.add(window.qsLocalCardKey(card)));
  }else if(event.ctrlKey||event.metaKey){if(studySelection.has(id))studySelection.delete(id);else studySelection.add(id);studyAnchor=index}
  else{studySelection=new Set([id]);studyAnchor=index}
  render();
}
async function applyBatchCategory(){
  if(!studySelection.size)return;
  const deck=document.getElementById('batchDeck')?.value.trim();
  if(!deck){alert('请输入分类名称。');return}
  const cards=importedOnly();let changed=0;
  cards.forEach(card=>{if(studySelection.has(window.qsLocalCardKey(card))){card.deck=deck;card.updatedAt=new Date().toISOString();changed++}});
  await persistImportedCards(cards);studySelection.clear();render();alert(`已更新 ${changed} 条项目的分类。`);
}
async function deleteManagedCards(){
  if(!studySelection.size)return;
  const count=studySelection.size;
  if(!confirm(`确定从本机删除选中的 ${count} 条项目吗？
内置示例词删除后，将在当前浏览器中隐藏。`))return;
  const removed=new Set(studySelection);
  await window.qsDeleteLocalCards(removed);studySelection.clear();selected=0;studyPage=0;revealed=false;render();
}
function bindManagerControls(list,pageStart){
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;selected=0;studyPage=0;studySelection.clear();revealed=false;render()});
  document.querySelectorAll('[data-select-card]').forEach(button=>button.onclick=event=>selectManagedCard(button.dataset.selectCard,+button.dataset.index,event));
  document.querySelectorAll('[data-word]').forEach(button=>{
    let clickTimer=0;
    button.onclick=()=>{clearTimeout(clickTimer);clickTimer=setTimeout(()=>{const index=+button.dataset.word;if(index===selected)revealed=!revealed;else{selected=index;revealed=false}render()},190)};
    if(button.dataset.editable==='1')button.ondblclick=event=>{event.preventDefault();clearTimeout(clickTimer);editCard(list[+button.dataset.word])};
  });
  document.querySelectorAll('[data-rate]').forEach(button=>button.onclick=()=>rate(button.dataset.rate));
  document.getElementById('reveal')?.addEventListener('click',()=>{revealed=true;render()});
  const search=document.getElementById('studySearch');
  if(search)search.oninput=event=>{const value=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{window.studySearchQuery=value;selected=0;studyPage=0;studySelection.clear();revealed=false;render();requestAnimationFrame(()=>{const next=document.getElementById('studySearch');if(next){next.focus();next.setSelectionRange(value.length,value.length)}})},80)};
  document.getElementById('clearStudySearch')?.addEventListener('click',()=>{window.studySearchQuery='';selected=0;studyPage=0;render()});
  document.getElementById('clearManagedSelection')?.addEventListener('click',()=>{studySelection.clear();render()});
  document.getElementById('applyBatchDeck')?.addEventListener('click',applyBatchCategory);
  document.getElementById('deleteManagedCards')?.addEventListener('click',deleteManagedCards);
  document.getElementById('previousStudyPage')?.addEventListener('click',()=>{studyPage=Math.max(0,studyPage-1);selected=studyPage*STUDY_PAGE_SIZE;revealed=false;render()});
  document.getElementById('nextStudyPage')?.addEventListener('click',()=>{studyPage++;selected=studyPage*STUDY_PAGE_SIZE;revealed=false;render()});
  document.getElementById('selectPageCards')?.addEventListener('click',()=>{list.slice(pageStart,pageStart+STUDY_PAGE_SIZE).filter(card=>card.source==='anki').forEach(card=>studySelection.add(card.id));render()});
  document.getElementById('selectAllCards')?.addEventListener('click',()=>{list.filter(card=>card.source==='anki').forEach(card=>studySelection.add(card.id));render()});
  document.getElementById('editCurrentCard')?.addEventListener('click',()=>editCard(list[selected]));
}
function renderManagedStudy(){
  const list=visible(),library=view==='library',known=Object.values(progress).filter(x=>x.rating==='known').length;
  if(!list.length){selected=0;studyPage=0}else selected=Math.max(0,Math.min(selected,list.length-1));
  const pageCount=Math.max(1,Math.ceil(list.length/STUDY_PAGE_SIZE));
  studyPage=Math.max(0,Math.min(studyPage,pageCount-1));
  if(selected<studyPage*STUDY_PAGE_SIZE||selected>=(studyPage+1)*STUDY_PAGE_SIZE)studyPage=Math.floor(selected/STUDY_PAGE_SIZE);
  const pageStart=studyPage*STUDY_PAGE_SIZE,pageItems=list.slice(pageStart,pageStart+STUDY_PAGE_SIZE),card=list[selected];
  $('#cell').textContent=card?`B${selected+2}　⌄`:'B2　⌄';
  $('#formula').textContent=card?(revealed?`${card.word}　${card.sound||''}　${card.meaning}`:card.word):'未找到匹配项目';
  const categories=managerCategories(),selectionCount=studySelection.size;
  const filters=['全部','商务','日常',...(words.some(x=>x.kind==='导入')?['导入']:[])];
  const rows=pageItems.map((item,pageIndex)=>{
    const index=pageStart+pageIndex,p=progress[item.id||item.word],rating=p?.rating||'new',label={new:'待处理',hard:'进行中',known:'已完成'}[rating],managed=studySelection.has(item.id),category=item.kind==='商务'?'业务支持':item.kind==='日常'?'日常协作':item.deck||'导入资料';
    const rowNumber=library&&item.source==='anki'?`<button class="num rowSelect ${managed?'checked':''}" data-select-card="${safe(item.id)}" data-index="${index}" title="点击复选框多选；按住 Shift 连选">${managed?'☑':'☐'}</button>`:`<div class="num">${index+2}</div>`;
    return `<div class="row">${rowNumber}<div class="cell ${managed?'batchSelected':''}">${String(index+1).padStart(3,'0')}</div><button class="cell word ${index===selected?'selected':''} ${managed?'batchSelected':''}" data-word="${index}" data-editable="${item.source==='anki'?1:0}" title="${item.source==='anki'?'双击编辑':'单击查看'}">${safe(item.word)}</button><div class="cell ${managed?'batchSelected':''}">${safe(category)}</div><div class="cell ${managed?'batchSelected':''}"><em class="${rating}">${label}</em></div><div class="cell ${managed?'batchSelected':''}"><strong class="${item.kind==='商务'?'high':''}">${item.kind==='商务'?'高':item.kind==='导入'?'资料':'常规'}</strong></div><div class="cell ${managed?'batchSelected':''}">${safe(item.updatedAt?.slice(0,10)||p?.next||'2026-07-18')}</div><div class="cell ${managed?'batchSelected':''}">Iris</div><div class="cell note ${managed?'batchSelected':''}">${index===selected&&revealed?safe(item.meaning):p?`已复核 ${p.reviews} 次`:item.source==='anki'?safe(item.tags||''):''}</div></div>`;
  }).join('');
  const detail=card?`<header>项目详情 <small>${card.source==='anki'?'双击项目名称或按 F2 编辑':'单击项目名称或按空格查看'}</small></header><div><h2>${safe(card.word)} <span>${safe(card.sound||'')}</span>${card.source==='anki'?'<button id="editCurrentCard" class="detailEdit">编辑</button>':''}</h2>${revealed?`<h3>${safe(card.meaning)}</h3><p><b>${card.kind==='导入'?'补充':'例句'}</b>${safe(card.example||'')}</p><section><button data-rate="new"><kbd>1</kbd>不认识<small>今天再复习</small></button><button data-rate="hard"><kbd>2</kbd>有点模糊<small>2 天后复习</small></button><button data-rate="known"><kbd>3</kbd>已掌握<small>7 天后复习</small></button></section>`:`<button class="reveal" id="reveal">显示项目说明 <span>Space</span></button>`}</div>`:`<header>项目详情</header><div class="emptyDetail"><b>没有匹配结果</b><span>请修改搜索词或项目类型筛选。</span></div>`;
  ws.innerHTML=`<div class="sheet">${headers()}<div class="summary"><div><small>今日计划</small><b>${library?list.length:Math.min(20,list.length)}</b><span>条项目</span></div><div><small>已检查</small><b>${Object.keys(progress).length}</b><span>累计项目</span></div><div><small>完成率</small><b>${words.length?Math.round(known/words.length*100):0}%</b><span>总体进度</span></div><div class="filters"><small>项目类型</small><p>${filters.map(item=>`<button class="${filter===item?'active':''}" data-filter="${item}">${item}</button>`).join('')}</p></div><div><strong>快捷操作</strong><span>↑↓ 选择　空格 查看　F2 编辑</span></div></div><div class="managebar"><label class="studySearchBox"><span>⌕</span><input id="studySearch" value="${safe(window.studySearchQuery)}" placeholder="查找问题、答案、分类或标签"><button id="clearStudySearch" title="清除搜索">×</button></label>${library?`<span class="batchHint">点击左侧 ☐ 多选</span><span class="selectionInfo">已选 <b>${selectionCount}</b> 条</span><button id="selectPageCards">全选本页</button><button id="selectAllCards">全选结果</button><input id="batchDeck" list="batchCategoryList" placeholder="输入新分类"><datalist id="batchCategoryList">${categories.map(x=>`<option value="${safe(x)}">`).join('')}</datalist><button id="applyBatchDeck" ${selectionCount?'':'disabled'}>修改分类</button><button id="deleteManagedCards" class="danger" ${selectionCount?'':'disabled'}>删除行</button><button id="clearManagedSelection" ${selectionCount?'':'disabled'}>取消选择</button>`:''}<i></i><div class="pageControls"><button id="previousStudyPage" ${studyPage===0?'disabled':''}>‹</button><span>${studyPage+1} / ${pageCount}　共 ${list.length} 条</span><button id="nextStudyPage" ${studyPage>=pageCount-1?'disabled':''}>›</button></div></div><div class="table"><div class="num">1</div>${['编号','项目名称','分类','当前状态','优先级','更新时间','负责人','备注'].map(title=>`<div class="cell th">${title}<span>⌄</span></div>`).join('')}${rows||'<div class="emptyRows">没有符合条件的项目</div>'}</div><aside class="review">${detail}</aside></div>`;
  bindManagerControls(list,pageStart);installColumnResize();
}
renderStudy=renderManagedStudy;
function libraryView(){return view==='library'&&!cover&&window.qsManageMode}
addEventListener('keydown',event=>{
  const openDialog=document.querySelector('dialog[open]');
  if(openDialog){event.stopImmediatePropagation();return}
  const target=event.target,typing=/INPUT|TEXTAREA|SELECT/.test(target?.tagName)||target?.isContentEditable;
  if(typing){event.stopImmediatePropagation();return}
  if(cover||view==='game')return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();document.getElementById('studySearch')?.focus();return}
  if(libraryView()&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();visible().forEach(card=>studySelection.add(window.qsLocalCardKey(card)));render();return}
  if(event.key==='F2'){const card=visible()[selected];if(card?.source==='anki'){event.preventDefault();event.stopImmediatePropagation();editCard(card)}}
  if(event.key==='Delete'&&studySelection.size&&libraryView()){event.preventDefault();event.stopImmediatePropagation();deleteManagedCards()}
},true);
document.getElementById('manageCards')?.addEventListener('click',()=>{
  if(!window.qsManageMode&&!words.length){alert('当前没有可管理的项目。');return}
  window.qsManageMode=!window.qsManageMode;
  view='library';cover=false;if(window.qsManageMode)filter='全部';selected=0;studyPage=0;studySelection.clear();window.qsSyncManageButton();render();
});
window.qsSyncManageButton();
