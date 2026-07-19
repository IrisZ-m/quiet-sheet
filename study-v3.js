/* Study v3: lean project table, stable Chinese search, local row selection, real daily queue. */
(function(){
"use strict";
const SIZE=150,LEGACY="legacy-import",BUILTIN_BATCH="__builtin__";
let searchTimer=0,composing=false,daily=Math.max(5,Math.min(100,Number(localStorage.getItem("quiet-sheet-daily-new-limit"))||20)),queueIds=new Set(),queue={due:0,newCards:0,learnedNew:0,done:0,total:0};
window.qsSelectedBatch=window.qsSelectedBatch||"";
function date(value=new Date()){const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,"0"),d=String(value.getDate()).padStart(2,"0");return y+"-"+m+"-"+d}
function key(card){return card&&card.id?card.id:(card&&card.word||"")}
function normalize(card){
 if(!card||card.source!=="anki")return card;
 if(!card.importBatchId)card.importBatchId=LEGACY;if(!card.importBatchName)card.importBatchName="历史导入";if(!card.importedAt)card.importedAt="";
 if(!card.dataName)card.dataName=String(card.importBatchName||"导入资料").replace(/\.[^.]+$/,"");if(!card.category)card.category=card.deck||"导入资料";
 if(!card.answerStatus)card.answerStatus=card.meaning&&card.meaning!=="（未提供答案）"?"ok":"missing";
 return card;
}
window.qsNormalizeCard=normalize;
let reviewScope=localStorage.getItem("quiet-sheet-review-scope")||"",reviewOrders=(()=>{try{const value=JSON.parse(localStorage.getItem("quiet-sheet-review-orders")||"{}");return value&&typeof value==="object"?value:{}}catch{return{}}})(),queueOrder=new Map();
function cardBatch(card){return card.source==="anki"?normalize(card).importBatchId:BUILTIN_BATCH}
function scopePreferenceKey(){return reviewScope||"__all__"}
function reviewOrder(scope=reviewScope){const value=reviewOrders[scope||"__all__"];if(!scope)return value==="sequential"||value==="random"?value:"perBatch";return value==="random"?"random":"sequential"}
function ensureReviewScope(){if(reviewScope&&!words.some(card=>cardBatch(card)===reviewScope)){reviewScope="";localStorage.removeItem("quiet-sheet-review-scope")}}
function inReviewScope(card){return!reviewScope||cardBatch(card)===reviewScope}
function stableHash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function sortForToday(cards,mode,scope){if(mode!=="random")return cards.slice();const stamp=date()+"|"+scope;return cards.slice().sort((a,b)=>stableHash(stamp+"|"+key(a))-stableHash(stamp+"|"+key(b))||key(a).localeCompare(key(b)))}
function orderedForToday(cards){
 if(reviewScope)return sortForToday(cards,reviewOrder(reviewScope),reviewScope);
 const allMode=reviewOrder(""),groups=new Map();cards.forEach(card=>{const id=cardBatch(card);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(card)});
 let entries=[...groups.entries()].map(([id,list])=>[id,sortForToday(list,allMode==="perBatch"?reviewOrder(id):allMode,id)]);if(allMode==="random")entries.sort((a,b)=>stableHash(date()+"|batch|"+a[0])-stableHash(date()+"|batch|"+b[0]));
 const result=[];for(let i=0;entries.some(x=>i<x[1].length);i++)entries.forEach(x=>{if(i<x[1].length)result.push(x[1][i])});return result;
}
window.studySortVisible=list=>view==="review"?list.slice().sort((a,b)=>(queueOrder.get(key(a))??Number.MAX_SAFE_INTEGER)-(queueOrder.get(key(b))??Number.MAX_SAFE_INTEGER)):list;
const baseReplace=replaceImported;replaceImported=function(cards){baseReplace(cards.map(normalize));ensureReviewScope()};
function matchText(card){
 const q=String(window.studySearchQuery||"").trim().toLocaleLowerCase();if(!q)return true;
 const text=[card.word,card.meaning,card.category,card.deck,card.tags,card.importBatchName,card.dataName,card.example].filter(Boolean).join(" ").toLocaleLowerCase();
 return q.split(/\s+/).every(x=>text.includes(x));
}
function kind(card){return filter==="全部"||card.kind===filter}
function rebuildQueue(){
 ensureReviewScope();const now=date(),base=words.filter(inReviewScope),due=base.filter(card=>{const p=progress[key(card)];return p&&p.reviewedAt!==now&&String(p.next||now)<=now}),fresh=base.filter(card=>!progress[key(card)]),learnedNew=Object.values(progress).filter(p=>p&&p.firstLearnedAt===now).length,remaining=Math.max(0,daily-learnedNew);
 const orderedDue=orderedForToday(due),news=orderedForToday(fresh).slice(0,remaining),ordered=orderedDue.concat(news);queueIds=new Set(ordered.map(key));queueOrder=new Map(ordered.map((card,index)=>[key(card),index]));queue={due:orderedDue.length,newCards:news.length,learnedNew:learnedNew,done:Object.values(progress).filter(p=>p&&p.reviewedAt===now).length,total:ordered.length};
}
window.studyMatches=function(card){if(!matchText(card))return false;if(view==="review")return queueIds.has(key(card));if(view==="library"&&window.qsSelectedBatch){if(window.qsSelectedBatch===BUILTIN_BATCH)return card.source!=="anki";return card.source==="anki"&&normalize(card).importBatchId===window.qsSelectedBatch}return true};
rate=function(r){
 const list=visible(),card=list[selected];if(!card)return;const position=capture(),d=new Date();d.setDate(d.getDate()+(r==="known"?7:r==="hard"?2:1));const k=key(card);
 const previous=progress[k];progress[k]={rating:r,reviews:(previous&&previous.reviews||0)+1,next:date(d),reviewedAt:date(),firstLearnedAt:previous?previous.firstLearnedAt||"":date()};localStorage.setItem("quiet-sheet-progress",JSON.stringify(progress));revealed=false;if(view!=="review")selected=Math.min(selected+1,Math.max(0,list.length-1));render();restore(position);
};
function batches(){const m=new Map();importedOnly().map(normalize).forEach(card=>{if(!m.has(card.importBatchId))m.set(card.importBatchId,{id:card.importBatchId,name:card.importBatchName,time:card.importedAt,count:0});m.get(card.importBatchId).count++});return[...m.values()].sort((a,b)=>a.id===LEGACY?1:b.id===LEGACY?-1:String(b.time).localeCompare(String(a.time)))}
function answer(card){if(card.answerStatus==="missing")return["缺少答案","answerMissing"];if(card.answerStatus==="format")return["格式异常","answerFormat"];if(card.clozeCount)return["完形 "+card.clozeCount+" 空","answerOk"];return["正常","answerOk"]}
function learned(card){const p=progress[key(card)];if(!p)return["待学习","new"];if(p.rating==="known")return["已掌握","known"];if(p.rating==="hard")return["有点模糊","hard"];return["待复习","new"]}
function pageBar(pages,total){return'<div class="pageControls" title="共 '+total+' 条"><button id="prevPage" '+(studyPage===0?"disabled":"")+'>‹</button><span>'+(studyPage+1)+" / "+pages+'</span><button id="nextPage" '+(studyPage>=pages-1?"disabled":"")+">›</button></div>"}
function batchOptions(selected=window.qsSelectedBatch){const builtins=words.filter(x=>x.source!=="anki").length,builtin=builtins?'<option value="'+BUILTIN_BATCH+'" '+(selected===BUILTIN_BATCH?"selected":"")+'>内置示例 · '+builtins+' 条</option>':"";return builtin+batches().map(b=>'<option value="'+safe(b.id)+'" '+(selected===b.id?"selected":"")+'>'+safe(b.name+" · "+b.count+" 条")+"</option>").join("")}
function batchFilter(){return'<label class="batchFilterLabel" title="按导入批次查看项目"><select id="batchFilter" aria-label="查看批次"><option value="">全部批次</option>'+batchOptions()+"</select></label>"}
function reviewSettings(){const mode=reviewOrder(),orderOptions=reviewScope?'<option value="sequential" '+(mode==="sequential"?"selected":"")+'>顺序学习</option><option value="random" '+(mode==="random"?"selected":"")+'>随机抽取</option>':'<option value="perBatch" '+(mode==="perBatch"?"selected":"")+'>按各批次设置</option><option value="sequential" '+(mode==="sequential"?"selected":"")+'>全部顺序</option><option value="random" '+(mode==="random"?"selected":"")+'>全部随机</option>';return'<label class="reviewSetting">学习范围 <select id="reviewScope" aria-label="学习范围"><option value="">全部资料</option>'+batchOptions(reviewScope)+'</select></label><label class="reviewSetting">学习顺序 <select id="reviewOrder" aria-label="学习顺序">'+orderOptions+'</select></label><label class="dailyLimit">每日新卡 <input id="dailyLimit" type="number" min="5" max="100" value="'+daily+'"></label><span class="reviewSaveState" title="修改后立即生效并保存在当前浏览器">自动保存</span>'}
function bar(list,start,pages){
 const search='<label class="studySearchBox"><span>⌕</span><input id="studySearch" value="'+safe(window.studySearchQuery)+'" placeholder="搜索题目、答案、分类或标签"><button id="clearStudySearch">×</button></label>';
 if(view==="review")return'<div class="managebar">'+search+'<span class="queueInfo">到期 <b>'+queue.due+'</b>　新卡待学 <b>'+queue.newCards+'</b>　今日已学新卡 <b>'+queue.learnedNew+'</b></span><i></i>'+pageBar(pages,list.length)+"</div>";
 if(!window.qsManageMode)return'<div class="managebar">'+search+batchFilter()+'<i></i>'+pageBar(pages,list.length)+"</div>";
 const count=studySelection.size,editable=[...studySelection].some(id=>!id.startsWith("builtin:")),canDeleteBatch=batches().some(b=>b.id===window.qsSelectedBatch),cats=[...new Set(importedOnly().map(x=>normalize(x).category))].filter(Boolean);
 return'<div class="managebar">'+search+batchFilter()+'<button id="deleteBatch" class="danger" '+(canDeleteBatch?"":"disabled")+'>删除整批</button><span class="selectionInfo">已选 <b id="selectedCount">'+count+'</b> 条</span><button id="selectPage">选本页</button><button id="selectAll">选全部</button><input id="newCategory" list="catList" placeholder="新分类"><datalist id="catList">'+cats.map(x=>'<option value="'+safe(x)+'">').join("")+'</datalist><button id="applyCategory" '+(editable?"":"disabled")+'>修改</button><button id="deleteRows" class="danger" '+(count?"":"disabled")+'>删除</button><button id="clearSelection" '+(count?"":"disabled")+'>取消</button><i></i>'+pageBar(pages,list.length)+"</div>";
}
function categoryName(card){return card.kind==="商务"?"业务支持":card.kind==="日常"?"日常协作":normalize(card).category||card.deck||"导入资料"}
function summary(list){
 if(view==="review")return'<div class="summary"><div title="到期复习与新卡待学"><small>今日待办</small><b>'+queue.total+'</b></div><div title="按计划需要复习"><small>今日到期</small><b>'+queue.due+'</b></div><div title="今天已完成评估"><small>今日完成</small><b>'+queue.done+'</b></div><div class="planSettings"><small>学习计划</small><p>'+reviewSettings()+'</p></div></div>';
 const abnormal=importedOnly().map(normalize).filter(x=>x.answerStatus!=="ok").length,started=words.filter(x=>progress[key(x)]).length,batchCount=batches().length,categoryCount=new Set(words.map(categoryName).filter(Boolean)).size,hasBuiltins=words.some(x=>x.source!=="anki");
 return'<div class="summary"><div title="当前筛选结果"><small>项目总数</small><b>'+list.length+'</b></div><div title="缺失或格式异常"><small>答案异常</small><b>'+abnormal+'</b></div><div title="累计开始学习"><small>已学习</small><b>'+started+'</b></div><div class="dataOverview"><small>资料概况</small><p><b>'+batchCount+'</b> 个批次　<b>'+categoryCount+'</b> 个分类'+(hasBuiltins?'　含内置示例':'')+'</p></div></div>';
}
function row(card,index){
 const imp=card.source==="anki",cardKey=window.qsLocalCardKey(card),checked=studySelection.has(cardKey),a=answer(card),l=learned(card),cat=categoryName(card),batch=imp?normalize(card).importBatchName:"内置资料",time=imp&&card.importedAt?card.importedAt.slice(0,10):"—",note=imp?(card.tags||card.dataName||""):(progress[key(card)]?"已复习 "+progress[key(card)].reviews+" 次":""),sel=checked?" batchSelected":"";
 const box=view==="library"&&window.qsManageMode?'<button class="num rowSelect '+(checked?"checked":"")+'" data-check="'+safe(cardKey)+'" data-index="'+index+'">'+(checked?"☑":"☐")+"</button>":'<div class="num">'+(index+2)+"</div>";
 return'<div class="row" data-row="'+safe(card.id||"")+'">'+box+'<div class="cell'+sel+'">'+String(index+1).padStart(3,"0")+'</div><button class="cell word '+(selected===index?"selected":"")+sel+'" data-word="'+index+'" data-edit="'+(imp?1:0)+'">'+safe(card.word)+'</button><div class="cell'+sel+'">'+safe(cat)+'</div><div class="cell'+sel+'"><em class="'+a[1]+'">'+a[0]+'</em></div><div class="cell'+sel+'"><em class="'+l[1]+'">'+l[0]+'</em></div><div class="cell'+sel+'">'+safe(batch)+'</div><div class="cell'+sel+'">'+safe(time)+'</div><div class="cell note'+sel+'">'+safe(note)+"</div></div>";
}
function clozeAnswers(card){
 const edited=String(card.meaning||"").split(/\r?\n/).map(x=>x.match(/^c\d+\s*[：:]\s*(.*)$/i)).filter(Boolean).slice(0,card.clozeCount||99).map(x=>x[1]);
 if(edited.length)return edited;if(Array.isArray(card.clozeAnswers)&&card.clozeAnswers.length)return card.clozeAnswers.map(String);return[];
}
function resolvedText(card){
 const answers=clozeAnswers(card);let i=0,text=String(card.word||"").replace(/\[[^\]\n]*\]/g,()=>answers[i++]||"[……]");
 if(!i&&card.clozeFull)text=card.clozeFull;return text;
}
function resolvedHtml(card){
 const answers=clozeAnswers(card);let i=0,masked=safe(card.word||""),html=masked.replace(/\[[^\]\n]*\]/g,()=>'<mark class="clozeAnswer">'+safe(answers[i++]||"……")+"</mark>");
 return i?html:safe(card.clozeFull||card.word||"");
}
function detail(card){
 if(!card)return'<header>项目详情</header><div class="emptyDetail"><b>没有待处理项目</b><span>可切换筛选条件或调整每日新卡数量。</span></div>';
 const imp=card.source==="anki",a=answer(card),edit=imp?'<button id="editCard" class="detailEdit">编辑</button>':"",status='<span class="detailStatus '+a[1]+'">'+a[0]+"</span>",question=card.clozeCount&&revealed?resolvedHtml(card):safe(card.word),answerBlock=!card.clozeCount&&revealed?'<div class="detailAnswer">'+safe(card.meaning||"（未提供答案）")+"</div>"+(card.example?'<div class="detailExtra">'+safe(card.example)+"</div>":""):"",ratings=revealed?'<section><button data-rate="new"><kbd>1</kbd>不认识<small>明天复习</small></button><button data-rate="hard"><kbd>2</kbd>有点模糊<small>2天后复习</small></button><button data-rate="known"><kbd>3</kbd>已掌握<small>7天后复习</small></button></section>':'<button class="reveal" id="reveal">显示项目说明 <span>Space</span></button>';
 return'<header>项目详情 <small>'+(imp?"双击项目名称或按 F2 编辑":"单击项目名称或按空格查看")+'</small></header><div class="detailPane"><div class="detailToolbar">'+status+edit+'</div><div class="detailScroll"><div class="detailText">'+question+"</div>"+answerBlock+"</div>"+ratings+"</div>";
}
function capture(){const s=ws.querySelector(".sheet");return s?{top:s.scrollTop,left:s.scrollLeft,pageX:window.scrollX,pageY:window.scrollY}:null}
function restore(p){if(!p)return;const apply=()=>{const s=ws.querySelector(".sheet");if(s){s.scrollTop=p.top;s.scrollLeft=p.left}window.scrollTo(p.pageX,p.pageY)};requestAnimationFrame(()=>{apply();requestAnimationFrame(apply)})}
window.qsCaptureStudyPosition=capture;window.qsRestoreStudyPosition=restore;
function renderStudy3(){
 filter="全部";if(view==="review")rebuildQueue();const list=visible();if(!list.length){selected=0;studyPage=0}else selected=Math.max(0,Math.min(selected,list.length-1));const pages=Math.max(1,Math.ceil(list.length/SIZE));studyPage=Math.max(0,Math.min(studyPage,pages-1));if(selected<studyPage*SIZE||selected>=(studyPage+1)*SIZE)selected=studyPage*SIZE;const start=studyPage*SIZE,items=list.slice(start,start+SIZE),card=list[selected],labels=["编号","项目名称","分类","答案状态","学习状态","导入批次","导入时间","标签 / 备注"];
 document.getElementById("cell").textContent=card?"B"+(selected+2)+"　⌄":"B2　⌄";document.getElementById("formula").textContent=card?(revealed&&card.clozeCount?resolvedText(card):revealed?card.word+"　"+card.meaning:card.word):"没有待处理项目";
 ws.innerHTML='<div class="sheet">'+headers()+summary(list)+bar(list,start,pages)+'<div class="table"><div class="num">1</div>'+labels.map(x=>'<div class="cell th">'+x+"<span>⌄</span></div>").join("")+(items.length?items.map((x,i)=>row(x,start+i)).join(""):'<div class="emptyRows">没有符合条件的项目</div>')+'</div><aside class="review">'+detail(card)+"</aside></div>";
 bind(list,start,pages);installColumnResize();const due=document.getElementById("due");if(due&&view==="review")due.textContent=queue.total+" 项";
}
renderStudy=renderStudy3;
function syncChecks(){document.querySelectorAll("[data-check]").forEach(b=>{const on=studySelection.has(b.dataset.check);b.textContent=on?"☑":"☐";b.classList.toggle("checked",on);const r=b.closest(".row");if(r)r.querySelectorAll(".cell").forEach(c=>c.classList.toggle("batchSelected",on))});const n=document.getElementById("selectedCount");if(n)n.textContent=studySelection.size;["deleteRows","clearSelection"].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=!studySelection.size});const ac=document.getElementById("applyCategory");if(ac)ac.disabled=![...studySelection].some(id=>!id.startsWith("builtin:"))}
function bindSearch(){const i=document.getElementById("studySearch");if(!i)return;const run=v=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{window.studySearchQuery=v;selected=0;studyPage=0;studySelection.clear();revealed=false;render();requestAnimationFrame(()=>{const n=document.getElementById("studySearch");if(n){n.focus();n.setSelectionRange(v.length,v.length)}})},120)};i.addEventListener("compositionstart",()=>composing=true);i.addEventListener("compositionend",e=>{composing=false;run(e.target.value)});i.addEventListener("input",e=>{if(!composing)run(e.target.value)});document.getElementById("clearStudySearch").onclick=()=>{window.studySearchQuery="";selected=0;studyPage=0;render()}}
async function changeCategory(){if(!studySelection.size)return;const v=document.getElementById("newCategory").value.trim();if(!v){alert("请输入分类名称。");return}const p=capture(),cards=importedOnly();cards.forEach(x=>{if(studySelection.has(x.id)){x.category=v;x.deck=v}});await persistImportedCards(cards);studySelection.clear();render();restore(p)}
async function deleteRows(){if(!studySelection.size||!confirm("确定从本机删除选中的 "+studySelection.size+" 条项目吗？\n内置示例词删除后，将在当前浏览器中隐藏。"))return;const removed=new Set(studySelection);await window.qsDeleteLocalCards(removed);if(window.qsSelectedBatch===BUILTIN_BATCH&&!words.some(x=>x.source!=="anki"))window.qsSelectedBatch="";studySelection.clear();selected=0;studyPage=0;render()}
async function deleteBatch(){const id=window.qsSelectedBatch,b=batches().find(x=>x.id===id);if(!b||!confirm("确定删除批次“"+b.name+"”的 "+b.count+" 条记录吗？\n该操作不受分页影响。"))return;const removed=new Set(importedOnly().filter(x=>normalize(x).importBatchId===id).map(x=>x.id));await persistImportedCards(importedOnly().filter(x=>!removed.has(x.id)));saveProgressAfterDelete(removed);window.qsSelectedBatch="";studySelection.clear();selected=0;studyPage=0;render()}
function bind(list,start,pages){
 bindSearch();document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;selected=0;studyPage=0;studySelection.clear();revealed=false;render()});
 document.querySelectorAll("[data-check]").forEach(b=>b.onclick=e=>{const id=b.dataset.check,n=Number(b.dataset.index);if(e.shiftKey&&studyAnchor>=0){const a=Math.min(studyAnchor,n),z=Math.max(studyAnchor,n);if(!e.ctrlKey&&!e.metaKey)studySelection.clear();list.slice(a,z+1).forEach(x=>studySelection.add(window.qsLocalCardKey(x)))}else{if(studySelection.has(id))studySelection.delete(id);else studySelection.add(id);studyAnchor=n}syncChecks()});
 document.querySelectorAll("[data-word]").forEach(b=>{let t=0;b.onclick=()=>{clearTimeout(t);t=setTimeout(()=>{const p=capture(),n=Number(b.dataset.word);if(n===selected)revealed=!revealed;else{selected=n;revealed=false}render();restore(p)},180)};if(b.dataset.edit==="1")b.ondblclick=e=>{e.preventDefault();clearTimeout(t);editCard(list[Number(b.dataset.word)])}});
 document.querySelectorAll("[data-rate]").forEach(b=>b.onclick=()=>rate(b.dataset.rate));const reveal=document.getElementById("reveal");if(reveal)reveal.onclick=()=>{const p=capture();revealed=true;render();restore(p)};const edit=document.getElementById("editCard");if(edit)edit.onclick=()=>editCard(list[selected]);
 const prev=document.getElementById("prevPage"),next=document.getElementById("nextPage");if(prev)prev.onclick=()=>{studyPage=Math.max(0,studyPage-1);selected=studyPage*SIZE;revealed=false;render()};if(next)next.onclick=()=>{studyPage=Math.min(pages-1,studyPage+1);selected=studyPage*SIZE;revealed=false;render()};
 const sp=document.getElementById("selectPage"),sa=document.getElementById("selectAll"),cs=document.getElementById("clearSelection");if(sp)sp.onclick=()=>{list.slice(start,start+SIZE).forEach(x=>studySelection.add(window.qsLocalCardKey(x)));syncChecks()};if(sa)sa.onclick=()=>{list.forEach(x=>studySelection.add(window.qsLocalCardKey(x)));syncChecks()};if(cs)cs.onclick=()=>{studySelection.clear();syncChecks()};
 const ac=document.getElementById("applyCategory"),dr=document.getElementById("deleteRows"),bf=document.getElementById("batchFilter"),db=document.getElementById("deleteBatch"),dl=document.getElementById("dailyLimit"),rs=document.getElementById("reviewScope"),ro=document.getElementById("reviewOrder");if(ac)ac.onclick=changeCategory;if(dr)dr.onclick=deleteRows;if(bf)bf.onchange=()=>{window.qsSelectedBatch=bf.value;selected=0;studyPage=0;studySelection.clear();revealed=false;render()};if(db)db.onclick=deleteBatch;if(dl)dl.onchange=()=>{daily=Math.max(5,Math.min(100,Number(dl.value)||20));localStorage.setItem("quiet-sheet-daily-new-limit",String(daily));selected=0;studyPage=0;render()};if(rs)rs.onchange=()=>{reviewScope=rs.value;filter="全部";localStorage.setItem("quiet-sheet-review-scope",reviewScope);selected=0;studyPage=0;revealed=false;render()};if(ro)ro.onchange=()=>{reviewOrders[scopePreferenceKey()]=ro.value;localStorage.setItem("quiet-sheet-review-orders",JSON.stringify(reviewOrders));selected=0;studyPage=0;revealed=false;render()};
}
addEventListener("keydown",e=>{if(document.querySelector("dialog[open]"))return;const t=e.target;if(t&&(/INPUT|TEXTAREA|SELECT|BUTTON/.test(t.tagName)||t.isContentEditable))return;if(e.key==="Escape"&&window.qsManageMode){e.preventDefault();window.qsManageMode=false;studySelection.clear();window.qsSyncManageButton&&window.qsSyncManageButton();render();return}if(cover||view==="game")return;const list=visible();if(!list.length)return;if(e.key===" "||e.key==="Enter"){e.preventDefault();e.stopImmediatePropagation();const p=capture();revealed=!revealed;render();restore(p);return}if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();e.stopImmediatePropagation();const p=capture();selected=Math.max(0,Math.min(list.length-1,selected+(e.key==="ArrowDown"?1:-1)));revealed=false;render();restore(p)}},true);
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.view==="review")filter="全部";window.qsManageMode=false;window.qsSyncManageButton&&window.qsSyncManageButton();window.studySearchQuery="";window.qsSelectedBatch="";studySelection.clear();selected=0;studyPage=0;revealed=false;setTimeout(render,0)}));
const manage=document.getElementById("manageCards");if(manage)manage.addEventListener("click",()=>setTimeout(render,0));
render();
})();