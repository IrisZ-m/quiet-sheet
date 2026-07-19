/* Import v3: one source note becomes one learning card; supports Anki text and ordinary CSV. */
(function(){
"use strict";
const baseParse=parseAnkiText;
function norm(v){return String(v||"").replace(/\s+/g," ").trim().toLocaleLowerCase()}
function fileTitle(v){return String(v||"导入资料").replace(/\.[^.]+$/,"")}
function colIndex(parsed,key){const n=Number(parsed.meta&&parsed.meta[key])-1;return Number.isInteger(n)&&n>=0&&n<parsed.columns.length?n:-1}
function headerLike(row){if(!row)return false;const re=/题目|问题|正面|答案|背面|释义|分类|科目|标签|tag|question|front|answer|back|meaning|category|deck|guid|^id$/;return row.some(v=>re.test(norm(v)))&&row.every(v=>String(v||"").length<40)}
parseAnkiText=function(text){
 const p=baseParse(text),meta=Object.keys(p.meta||{}).length>0;p.sourceColumns=p.columns.slice();
 p.sourceType=meta?"anki":"csv";p.headerDetected=false;p.headerRow=null;
 const specials=[["guid column","GUID"],["notetype column","笔记类型"],["deck column","牌组"],["tags column","标签"]];
 specials.forEach(x=>{const i=colIndex(p,x[0]);if(i>=0)p.columns[i]=x[1]});
 if(meta){
  const reserved=new Set(specials.map(x=>colIndex(p,x[0])).filter(i=>i>=0)),regular=[];
  p.columns.forEach((v,i)=>{if(!reserved.has(i))regular.push(i)});
  if(regular[0]!==undefined)p.columns[regular[0]]="题目 / 正文";
  if(regular[1]!==undefined)p.columns[regular[1]]="答案 / 补充";
 }else if(p.rows.length&&headerLike(p.rows[0])){
  p.headerDetected=true;p.headerRow=p.rows[0].slice();p.columns=p.headerRow.map((v,i)=>String(v||"字段 "+(i+1)).trim());p.sourceColumns=p.columns.slice();p.rows=p.rows.slice(1);
 }
 return p;
};
suggestMappings=function(columns){
 let front=false,back=false;
 const out=columns.map(name=>{
  const n=norm(name);
  if(/guid|唯一标识|^id$/.test(n))return"guid";
  if(/笔记类型|notetype|模板/.test(n))return"notetype";
  if(/标签|tags?/.test(n))return"tags";
  if(/牌组|deck/.test(n))return"deck";
  if(/分类|科目|category|subject/.test(n))return"category";
  if(/提示|hint/.test(n))return"hint";
  if(/补充说明|备注|extra/.test(n))return"extra";
  if(/题目|问题|正面|正文|front|question/.test(n)&&!front){front=true;return"front"}
  if(/答案|背面|释义|back|answer|meaning/.test(n)&&!back){back=true;return"back"}
  return"ignore";
 });
 if(!out.includes("front")&&out.length)out[0]="front";
 if(!out.includes("back")&&out.length>1){const i=out.findIndex((v,n)=>n>0&&v==="ignore");if(i>=0)out[i]="back"}
 return out;
};
function options(value){
 return[["ignore","忽略"],["front","题目 / 正文"],["back","答案 / 背面"],["category","分类 / 科目"],["deck","牌组"],["tags","标签"],["hint","提示"],["extra","补充说明"],["guid","GUID"],["notetype","笔记类型"]].map(x=>'<option value="'+x[0]+'" '+(x[0]===value?"selected":"")+'>'+x[1]+"</option>").join("");
}
function sample(v,allowHtml){return plainContent(v,allowHtml).replace(/\s+/g," ").trim().slice(0,90)}
function sampleWarning(v,allowHtml){const length=plainContent(v,allowHtml).length;return length>2000?'<small class="fieldWarning">样例内容较长：约 '+length.toLocaleString()+' 字符</small>':""}
function originalFieldName(p,i){const value=String(p.sourceColumns&&p.sourceColumns[i]||"").trim();return /^字段\s*\d+$/i.test(value)?"":value}
function pick(row,maps,key){return maps.map((m,i)=>m===key?row[i]:"").filter(Boolean).join(" · ")}
function mediaInfo(value){
 const text=String(value||""),types=[];
 if(/\[sound:[^\]]+\]/i.test(text)||/<audio\b/i.test(text))types.push("音频");
 if(/<img\b/i.test(text))types.push("图片");
 if(/<video\b/i.test(text))types.push("视频");
 return{has:types.length>0,types:[...new Set(types)]};
}
function badCloze(v){v=String(v||"");return /\{\s+\{c\d+::/i.test(v)||/\{\{c\d+::[\s\S]*?\}\s+\}/i.test(v)||(/\{\{c\d+::/i.test(v)&&!/\{\{c\d+::[\s\S]*?\}\}/i.test(v))}
function clozeOne(text){
 const answers=[],re=/\{\{c(\d+)::([^{}]*?)(?:::(.*?))?\}\}/gi;
 const question=text.replace(re,(all,n,a,h)=>{answers.push({n:n,a:String(a).trim(),h:String(h||"").trim()});return"["+(h||"……")+"]"});
 return{found:answers.length>0,question:question,answer:answers.map(x=>"c"+x.n+"："+x.a).join("\n"),answers:answers.map(x=>x.a),full:text.replace(re,(all,n,a)=>a),count:answers.length};
}
function rowsNow(p){const h=document.getElementById("firstRowHeader");return h&&!h.checked&&p.headerRow?[p.headerRow].concat(p.rows):p.rows}
function inspect(p,maps){
 let cloze=0,qa=0,missing=0,format=0,duplicate=0,mediaOnly=0;const seen=new Set();
 rowsNow(p).forEach(row=>{
  const rf=pick(row,maps,"front"),rb=pick(row,maps,"back");
  const media=mediaInfo([rf,rb,pick(row,maps,"hint"),pick(row,maps,"extra")].join("\n"));
  if(!String(rf||"").trim()){format++;return}
  const f=plainContent(rf,p.html),b=plainContent(rb,p.html),c=clozeOne(f);
  if(!f){if(media.has)mediaOnly++;else format++;return}
  const category=pick(row,maps,"category")||pick(row,maps,"deck");
  const fingerprint=norm((c.found?c.question:f)+"|"+(c.found?c.answer:b)+"|"+category);
  if(seen.has(fingerprint))duplicate++;else seen.add(fingerprint);
  if(badCloze(f))format++;else if(c.found)cloze++;else if(b)qa++;else missing++;
 });
 return{total:rowsNow(p).length,cloze:cloze,qa:qa,missing:missing,format:format,duplicate:duplicate,mediaOnly:mediaOnly};
}
function statHtml(s){return'<div class="importStats"><span><b>'+s.total+'</b>总记录</span><span><b>'+s.cloze+'</b>完形</span><span><b>'+s.qa+'</b>普通问答</span><span class="'+(s.missing?"warn":"")+'"><b>'+s.missing+'</b>缺少答案</span><span class="'+(s.format?"warn":"")+'"><b>'+s.format+'</b>格式异常</span><span class="'+(s.duplicate?"warn":"")+'"><b>'+s.duplicate+'</b>重复记录</span><span class="'+(s.mediaOnly?"warn":"")+'"><b>'+s.mediaOnly+'</b>仅含媒体</span></div>'}
function refreshStats(){const h=document.getElementById("importStatsHost");if(!h)return;const maps=[...ankiDialog.querySelectorAll("[data-map]")].map(x=>x.value);h.innerHTML=statHtml(inspect(pendingAnki,maps))}
showAnkiDialog=function(parsed,fileName){
 pendingAnki=Object.assign({},parsed,{fileName:fileName});
 const maps=suggestMappings(parsed.columns),source=parsed.sourceType==="anki"?"Anki 文本":"通用 CSV",sep=parsed.separator==="\t"?"制表符":parsed.separator;
 ankiDialog.innerHTML='<div class="importPanel"><header><div><b>'+source+'导入</b><small>'+safe(fileName)+' · '+parsed.rows.length+' 条数据 · '+safe(sep)+'</small></div><button id="closeImport">×</button></header><section class="importBody">'+
 '<div class="importMetaGrid"><label><span>资料名称</span><input id="importDataName" value="'+safe(fileTitle(fileName))+'"></label><label><span>统一分类</span><input id="importCategory" placeholder="可选，例如：文学常识"></label><label><span>追加标签</span><input id="importExtraTags" placeholder="可选，空格分隔"></label></div>'+
 '<div id="importStatsHost">'+statHtml(inspect(parsed,maps))+'</div><h3>1. 映射字段</h3><div class="mappingGrid">'+parsed.columns.map((name,i)=>'<label><span><b>字段 '+(i+1)+'</b>'+(originalFieldName(parsed,i)?'<small class="fieldOrigin">原字段：'+safe(originalFieldName(parsed,i))+'</small>':'')+'<small>样例：'+safe(sample(parsed.rows[0]&&parsed.rows[0][i],parsed.html)||"（空）")+'</small>'+sampleWarning(parsed.rows[0]&&parsed.rows[0][i],parsed.html)+'</span><select data-map="'+i+'">'+options(maps[i])+'</select></label>').join("")+'</div>'+
 '<h3>2. 数据预览</h3><div class="importPreview"><table><thead><tr>'+parsed.columns.map((x,i)=>"<th>字段 "+(i+1)+"</th>").join("")+'</tr></thead><tbody>'+parsed.rows.slice(0,6).map(r=>"<tr>"+r.map(x=>"<td>"+safe(sample(x,parsed.html))+"</td>").join("")+"</tr>").join("")+'</tbody></table></div>'+
 '<div class="importOptions"><div class="importOptionGroup">'+(parsed.headerDetected?'<label><input id="firstRowHeader" type="checkbox" checked> 第一行是列名</label>':"")+'<label>重复内容 <select id="duplicateMode"><option value="update">更新已有内容</option><option value="skip">跳过重复内容</option><option value="copy">保留为副本</option></select></label></div><span>'+(parsed.sourceType==="anki"?"已读取牌组、笔记类型和 GUID。":"普通表格建议使用 UTF-8 编码。")+'</span></div></section><footer><button id="cancelImport">取消</button><button class="primary" id="confirmImport">开始导入</button></footer></div>';
 document.getElementById("closeImport").onclick=document.getElementById("cancelImport").onclick=()=>ankiDialog.close();
 document.getElementById("confirmImport").onclick=confirmAnkiImport;
 ankiDialog.querySelectorAll("[data-map]").forEach(x=>x.onchange=refreshStats);
 const h=document.getElementById("firstRowHeader");if(h)h.onchange=refreshStats;
 ankiDialog.showModal();
};
function fp(q,a,c){return norm(q)+"|"+norm(a)+"|"+norm(c)}
confirmAnkiImport=async function(){
 if(!pendingAnki)return;
 const maps=[...ankiDialog.querySelectorAll("[data-map]")].map(x=>x.value);
 if(!maps.includes("front")){alert("请至少指定题目列。");return}
 const mode=document.getElementById("duplicateMode").value,dataName=(document.getElementById("importDataName").value||fileTitle(pendingAnki.fileName)).trim(),forced=document.getElementById("importCategory").value.trim(),extraTags=document.getElementById("importExtraTags").value.trim();
 const batchId="batch:"+Date.now().toString(36)+":"+Math.random().toString(36).slice(2,8),batchName=pendingAnki.fileName||dataName,importedAt=new Date().toISOString();
 const existing=importedOnly().map(window.qsNormalizeCard||function(x){return x}),byId=new Map(existing.map(x=>[x.id,x])),content=new Map();
 existing.forEach(x=>content.set(fp(x.word,x.meaning,x.category||x.deck),x.id));
 let added=0,updated=0,skipped=0,missing=0,format=0,mediaOnly=0;
 for(const row of rowsNow(pendingAnki)){
  const raw=pick(row,maps,"front"),rawBack=pick(row,maps,"back"),rawHint=pick(row,maps,"hint"),rawExtra=pick(row,maps,"extra"),media=mediaInfo([raw,rawBack,rawHint,rawExtra].join("\n"));if(!String(raw||"").trim()){format++;skipped++;continue}
  const front=plainContent(raw,pendingAnki.html),back=plainContent(rawBack,pendingAnki.html),hint=plainContent(rawHint,pendingAnki.html),extra=plainContent(rawExtra,pendingAnki.html),deck=plainContent(pick(row,maps,"deck"),false)||pendingAnki.deck||"",category=forced||plainContent(pick(row,maps,"category"),false)||deck||dataName||"导入资料",tags=[pendingAnki.globalTags,plainContent(pick(row,maps,"tags"),false),extraTags].filter(Boolean).join(" ").trim(),guid=plainContent(pick(row,maps,"guid"),false),noteType=plainContent(pick(row,maps,"notetype"),false);
  if(!front){if(media.has)mediaOnly++;else format++;skipped++;continue}
  const c=clozeOne(front),bad=badCloze(front);let q=front,a=back,e=[hint,extra].filter(Boolean).join("\n"),status="ok";
  if(c.found&&!bad){q=c.question;a=[c.answer,back].filter(Boolean).join("\n");e=[hint,extra].filter(Boolean).join("\n")}
  else if(bad){status="format";format++;a=back||"（完形标记格式异常，请检查原始记录）"}
  else if(!back){status="missing";missing++;a="（未识别到明确答案）"}
  const base=guid?"anki:"+guid:cardId(q,category,""),finger=fp(q,a,category),same=content.get(finger),related=[];
  if(guid)byId.forEach((card,id)=>{if(id===base||card.noteGuid===guid||id.indexOf(base+":c")===0)related.push(id)});
  if(mode==="skip"&&(byId.has(base)||same)){skipped++;continue}
  let id=base;if(mode==="copy"&&(byId.has(id)||same))id=base+":"+Date.now().toString(36)+":"+added;
  const existed=byId.has(id)||related.length>0||Boolean(same);
  if(mode==="update"){related.forEach(old=>{byId.delete(old);delete progress[old]});if(same&&same!==base){id=same;byId.delete(same)}}
  const card={id:id,word:q,sound:"",meaning:a,kind:"导入",example:e,category:category,deck:deck||category,tags:tags,source:"anki",dataName:dataName,noteType:noteType,noteGuid:guid,answerStatus:status,clozeCount:c.found?c.count:0,clozeAnswers:c.found?c.answers:[],clozeFull:c.found?c.full:"",mediaOmitted:media.has,mediaTypes:media.types,importBatchId:batchId,importBatchName:batchName,importedAt:importedAt,sourceFormat:pendingAnki.sourceType};
  byId.set(id,card);content.set(finger,id);if(existed)updated++;else added++;
 }
 const all=[...byId.values()];await dbWriteCards(all);localStorage.setItem("quiet-sheet-progress",JSON.stringify(progress));replaceImported(all);filter="导入";selected=0;revealed=false;view="library";cover=false;studyPage=0;studySelection.clear();window.qsSelectedBatch=batchId;ankiDialog.close();render();
 alert("导入完成：新增 "+added+" 条，更新 "+updated+" 条，跳过 "+skipped+" 条。"+(missing?"\n缺少答案 "+missing+" 条。":"")+(format?"\n格式异常 "+format+" 条。":"")+(mediaOnly?"\n仅含媒体并已跳过 "+mediaOnly+" 条。":""));
};
window.qsImportHelpers={clozeOne:clozeOne,badCloze:badCloze,inspect:inspect};
})();