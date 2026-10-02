/* Edge Journal — jurnal trading pribadi. Token tidak pernah ditulis ke source code. */
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'edgeJournal.trades.v1';
const REVIEW_KEY = 'edgeJournal.reviews.v1';
const GITHUB_CONFIG_KEY = 'edgeJournal.githubConfig.v1';
const GITHUB_DEFAULTS = Object.freeze({ owner: 'faizfirdaus505', repo: 'dge-journal-data', dataRepo: 'dge-journal-data', branch: 'main', pagesUrl: 'https://faizfirdaus505.github.io/dge-journal-data/' });
const ACCOUNT_KEY = 'edgeJournal.accountSettings.v1';
const GITHUB_DATA_PATH = '.edge-journal/journal.json';
let githubSyncTimer = null;
let githubSyncBusy = false;
let githubSyncPaused = false;
let accountSettings = readObject(ACCOUNT_KEY, { idrBalance: 0, usdtBalance: 0, usdtIdrRate: 16000, updatedAt: 0 });
let deletedRecords = readStore('edgeJournal.deletedRecords.v1', []);
let trades = readStore(STORAGE_KEY, []);
let reviews = readStore(REVIEW_KEY, []);
let currentImageData = '';
let marketCoins = [];
let marketLoading = false;
let watchedCoins = readStore('edgeJournal.watchlist.v1', []);
let toastTimer;

function readStore(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key));
 return Array.isArray(v) ? v : fallback;
 } catch { return fallback;
 } }
function readObject(key, fallback) { try { const v=JSON.parse(localStorage.getItem(key));
 return v && typeof v==='object' && !Array.isArray(v) ? v : fallback;
 } catch { return fallback;
 } }
function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
 localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews));
 localStorage.setItem('edgeJournal.deletedRecords.v1', JSON.stringify(deletedRecords));
 $('lastSaved').textContent = 'Tersimpan di perangkat · ' + new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
 $('storageDot').style.background = 'var(--green)';
 $('storageStatus').textContent = 'Tersimpan lokal';
 const cfg=getGitHubConfig();
 if(cfg?.token&&cfg?.owner&&cfg?.repo&&cfg?.dataRepo&&cfg?.branch){$('syncText').textContent='Tersimpan lokal · sinkronisasi GitHub dijadwalkan';
 scheduleGitHubSync();
}else{$('syncText').textContent='Tersimpan di browser ini. Hubungkan GitHub untuk sinkronisasi antarperangkat.';
} return true;
 } catch (e) { toast('Jurnal gagal disimpan. Penyimpanan browser mungkin penuh; hapus gambar besar atau ekspor cadangan.');
 return false;
 } }
function getGitHubConfig(){try{return JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY)||'null')}catch{return null}}
function repoUrl(cfg=getGitHubConfig()){return cfg?.owner&&cfg?.repo?`https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`:'https://github.com/'}
function setGitHubStatus(message,state='neutral'){const el=$('githubStatus');
if(!el)return;
el.className='github-status '+state;
el.innerHTML=`<span class="github-status-dot"></span><span>${esc(message)}</span>`;
}
function fillGitHubForm(){const c={...GITHUB_DEFAULTS,...(getGitHubConfig()||{})};
$('ghToken').value=c.token||'';
$('ghOwner').value=c.owner;
$('ghRepo').value=c.repo;
$('ghDataRepo').value=c.dataRepo||'edge-journal-data';
$('ghBranch').value=c.branch;
$('ghPagesUrl').value=c.pagesUrl||'';
if(c.token&&c.owner&&c.repo){setGitHubStatus(`Situs ${c.owner}/${c.repo} · data ${c.dataRepo||'edge-journal-data'} · branch ${c.branch||'main'}.`, 'connected')}else setGitHubStatus('Belum terhubung. Isi token dan detail repository untuk mulai.');
}
function readGitHubForm(){return {token:$('ghToken').value.trim(),owner:$('ghOwner').value.trim(),repo:$('ghRepo').value.trim(),dataRepo:$('ghDataRepo').value.trim(),branch:$('ghBranch').value.trim()||'main',pagesUrl:$('ghPagesUrl').value.trim()};
}
function validateGitHubConfig(c){if(!c.token||!c.owner||!c.repo||!c.dataRepo||!c.branch){throw new Error('Token, username, repository situs, repository data, dan branch wajib diisi.');
}if(!/^[a-zA-Z0-9-]+$/.test(c.owner)||! /^[a-zA-Z0-9._-]+$/.test(c.repo)||! /^[a-zA-Z0-9._-]+$/.test(c.dataRepo)){throw new Error('Format username atau nama repository tidak valid.');
}}
async function githubApi(path, cfg=getGitHubConfig(), options={}){if(!cfg?.token)throw new Error('Token GitHub belum diisi.');
const response=await fetch('https://api.github.com'+path,{...options,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+cfg.token,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});
let data={};
try{data=await response.json()}catch{}if(!response.ok){const message=data.message||`GitHub API error (${response.status})`;
const err=new Error(response.status===401?'Token ditolak. Periksa token dan izin akses.':response.status===403?'Akses ditolak atau batas API tercapai. Periksa izin token.':response.status===404?'File/repository tidak ditemukan atau token tidak memiliki akses.':message);
err.status=response.status;
throw err;
}return data;
}
async function testGitHubConnection(cfg=readGitHubForm()){validateGitHubConfig(cfg);
setGitHubStatus('Memeriksa token dan repository data…','loading');
const repo=await githubApi(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.dataRepo)}`,cfg);
if(repo.default_branch!==cfg.branch){try{await githubApi(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.dataRepo)}/branches/${encodeURIComponent(cfg.branch)}`,cfg)}catch{throw new Error(`Branch “${cfg.branch}” tidak ditemukan pada repository data. Branch default-nya “${repo.default_branch}”.`);
}}setGitHubStatus(`Terhubung · penyimpanan ${repo.private?'privat':'publik'} ${repo.full_name} · branch ${cfg.branch}.`,'connected');
return {repo};
}
function scheduleGitHubSync(){if(githubSyncPaused||!getGitHubConfig()?.token||!getGitHubConfig()?.dataRepo)return;
clearTimeout(githubSyncTimer);
githubSyncTimer=setTimeout(()=>syncJournalToGitHub(false),1800);
}
function encodeBase64Unicode(value){const bytes=new TextEncoder().encode(value);
let binary='';
for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
return btoa(binary)}
function decodeBase64Unicode(value){const binary=atob(value.replace(/\n/g,''));
const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
return new TextDecoder().decode(bytes)}
async function getGitHubJournal(cfg){const path='/repos/'+encodeURIComponent(cfg.owner)+'/'+encodeURIComponent(cfg.dataRepo)+'/contents/'+GITHUB_DATA_PATH.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(cfg.branch);
try{return await githubApi(path,cfg)}catch(e){if(e.status===404)return null;
throw e;
}}
async function syncJournalToGitHub(showToast=true){const cfg=getGitHubConfig();
if(!cfg?.token||!cfg?.dataRepo)return false;
if(githubSyncBusy){scheduleGitHubSync();
return false;
}githubSyncBusy=true;
try{const path=`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.dataRepo)}/contents/${GITHUB_DATA_PATH.split('/').map(encodeURIComponent).join('/')}`;
let saved=false;
for(let attempt=0;attempt<3&&!saved;attempt++){const existing=await getGitHubJournal(cfg);
if(existing?.content){const remoteData=JSON.parse(decodeBase64Unicode(existing.content));
deletedRecords=[...new Set([...deletedRecords,...(remoteData.deletedRecords||[])])];
trades=mergeById(trades,remoteData.trades||[]).filter(t=>!deletedRecords.includes('trade:'+t.id));
reviews=mergeById(reviews,remoteData.reviews||[]).filter(r=>!deletedRecords.includes('review:'+r.id));
if(remoteData.accountSettings&&Number(remoteData.accountSettings.updatedAt||0)>Number(accountSettings.updatedAt||0))accountSettings=remoteData.accountSettings;
try{localStorage.setItem(STORAGE_KEY,JSON.stringify(trades));
localStorage.setItem(REVIEW_KEY,JSON.stringify(reviews));
localStorage.setItem(ACCOUNT_KEY,JSON.stringify(accountSettings));
localStorage.setItem('edgeJournal.deletedRecords.v1',JSON.stringify(deletedRecords));
}catch(storageError){throw new Error('Data lokal tidak dapat diperbarui. Periksa ruang penyimpanan browser.');
}}const payload={app:'Edge Journal',version:3,updatedAt:new Date().toISOString(),trades,reviews,accountSettings,deletedRecords};
const body={message:'Perbarui jurnal Edge Journal',content:encodeBase64Unicode(JSON.stringify(payload,null,2)),branch:cfg.branch};
if(existing?.sha)body.sha=existing.sha;
try{await githubApi(path,cfg,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
saved=true;
}catch(err){if(err.status!==409||attempt===2)throw err;
}}if(!saved)throw new Error('GitHub belum menerima perubahan. Coba sinkronkan kembali.');
const time=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
$('storageStatus').textContent='GitHub tersinkron';
$('storageDot').style.background='var(--green)';
$('syncText').textContent='Tersinkron ke GitHub · '+time;
$('lastSaved').textContent='Tersimpan lokal + GitHub · '+time;
setGitHubStatus(`Tersinkron · ${cfg.owner}/${cfg.dataRepo} · ${cfg.branch}`,'connected');
renderAll();
if(showToast)toast('Jurnal berhasil disinkronkan ke GitHub.');
return true;
}catch(e){$('storageStatus').textContent='Sinkronisasi gagal';
$('storageDot').style.background='var(--orange)';
$('syncText').textContent='Tersimpan lokal · sinkronisasi GitHub gagal';
setGitHubStatus(e.message,'error');
if(showToast)toast('Sinkronisasi GitHub gagal: '+e.message);
return false;
}finally{githubSyncBusy=false;
}}
function mergeById(local,remote){const map=new Map();
const stamp=x=>Number(x.updatedAt||x.createdAt||0);
(remote||[]).forEach(x=>map.set(x.id||uid(),x));
(local||[]).forEach(x=>{const key=x.id||uid(),old=map.get(key);if(!old||stamp(x)>=stamp(old))map.set(key,x)});
return [...map.values()]}
async function syncJournalFromGitHub({quiet=false}={}){const cfg=getGitHubConfig();
if(!cfg?.token||!cfg?.dataRepo)return false;
try{const remote=await getGitHubJournal(cfg);
if(!remote){return await syncJournalToGitHub(!quiet);
}const data=JSON.parse(decodeBase64Unicode(remote.content||''));
if(!Array.isArray(data.trades)||!Array.isArray(data.reviews))throw new Error('Format file jurnal di repository tidak valid.');
const hadLocal=trades.length||reviews.length||deletedRecords.length;const remoteTradeMap=new Map((data.trades||[]).map(t=>[t.id,t]));const remoteReviewMap=new Map((data.reviews||[]).map(r=>[r.id,r]));const remoteDeleted=data.deletedRecords||[];const localNeedsPush=trades.some(t=>!remoteTradeMap.has(t.id)||Number(t.updatedAt||t.createdAt||0)>Number(remoteTradeMap.get(t.id).updatedAt||remoteTradeMap.get(t.id).createdAt||0))||reviews.some(r=>!remoteReviewMap.has(r.id)||Number(r.updatedAt||r.createdAt||0)>Number(remoteReviewMap.get(r.id).updatedAt||remoteReviewMap.get(r.id).createdAt||0))||deletedRecords.some(x=>!remoteDeleted.includes(x))||Number(accountSettings.updatedAt||0)>Number(data.accountSettings?.updatedAt||0);
 deletedRecords=[...new Set([...deletedRecords,...remoteDeleted])];
 if(data.accountSettings && Number(data.accountSettings.updatedAt||0)>Number(accountSettings.updatedAt||0)) accountSettings={...data.accountSettings};
trades=(hadLocal?mergeById(trades,data.trades):data.trades).filter(x=>!deletedRecords.includes('trade:'+x.id));
reviews=(hadLocal?mergeById(reviews,data.reviews):data.reviews).filter(x=>!deletedRecords.includes('review:'+x.id));
githubSyncPaused=true;
localStorage.setItem(STORAGE_KEY,JSON.stringify(trades));
localStorage.setItem(REVIEW_KEY,JSON.stringify(reviews));
localStorage.setItem(ACCOUNT_KEY,JSON.stringify(accountSettings));
localStorage.setItem('edgeJournal.deletedRecords.v1',JSON.stringify(deletedRecords));
githubSyncPaused=false;
renderAll();
if(localNeedsPush){const pushed=await syncJournalToGitHub(false);if(!pushed)return false;
}else{$('storageStatus').textContent='GitHub tersinkron';
$('storageDot').style.background='var(--green)';
$('syncText').textContent='Jurnal terbaru dimuat dari GitHub · '+new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
$('lastSaved').textContent='Tersinkron dengan GitHub';
}if(!quiet)toast('Jurnal berhasil diperbarui dari GitHub.');
return true;
}catch(e){githubSyncPaused=false;
setGitHubStatus('Sinkronisasi gagal: '+e.message,'error');
if(!quiet)toast('Tidak dapat mengambil jurnal dari GitHub: '+e.message);
return false;
}}
function openGitHubSettings(){fillGitHubForm();
$('githubDialog').showModal();
}
async function saveGitHubSettings(e){e.preventDefault();
const cfg=readGitHubForm();
const btn=$('githubSaveBtn');
try{validateGitHubConfig(cfg);
if(!cfg.pagesUrl)cfg.pagesUrl='';
btn.disabled=true;
btn.textContent='MENGUJI…';
await testGitHubConnection(cfg);
localStorage.setItem(GITHUB_CONFIG_KEY,JSON.stringify(cfg));
$('githubDialog').close();
$('githubBtn').innerHTML='⚙ Pengaturan GitHub <span>↗</span>';
 $('githubOpenBtn').innerHTML='◉ Buka Repository Situs <span>↗</span>';
await syncJournalFromGitHub({quiet:true});
toast('Pengaturan tersimpan. Periksa status untuk memastikan sinkronisasi GitHub berhasil.');
}catch(err){setGitHubStatus(err.message,'error');
toast('Koneksi GitHub gagal: '+err.message);
}finally{btn.disabled=false;
btn.textContent='SIMPAN';
}}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
 }
function num(v) { const n = Number(v);
 return Number.isFinite(n) ? n : 0;
 }
function money(v, digits=2) { return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
 }
function tradeQuote(t){return t.quote || ((t.market==='Spot' && /IDR/i.test(t.pair||''))?'IDR':'USDT');
}
function tradeMoney(t,v){const q=tradeQuote(t);
return (v<0?'-':'')+(q==='IDR'?'Rp ':'USDT ')+Math.abs(v).toLocaleString('id-ID',{minimumFractionDigits:0,maximumFractionDigits:q==='IDR'?0:2});
}
function marketTrades(market){return trades.filter(t=>t.market===market || (market==='Futures' && t.market==='Margin'));
}
function pnlForMarket(market){return closedTrades().filter(t=>market==='Spot'?(t.market==='Spot'&&tradeQuote(t)==='IDR'):(t.market!=='Spot'&&tradeQuote(t)==='USDT')).reduce((s,t)=>s+calcPnl(t),0);
}
function pct(v) { return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
 }
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 }
function dateFmt(s) { if (!s) return '—';
 const d = new Date(s + (s.length===10?'T12:00:00':''));
 return Number.isNaN(+d) ? s : d.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'2-digit'});
 }
function closedTrades() { return trades.filter(t => t.status === 'Closed' && t.exit !== '' && t.exit !== null && (t.manualPnl !== '' && t.manualPnl !== null && t.manualPnl !== undefined || t.entry !== '' && t.qty !== ''));
 }
function calcPnl(t) { if (t.manualPnl !== '' && t.manualPnl !== null && t.manualPnl !== undefined && Number.isFinite(Number(t.manualPnl))) return Number(t.manualPnl);
 if (t.status !== 'Closed' || t.exit === '' || t.exit === null) return null;
 const diff = (num(t.exit)-num(t.entry)) * num(t.qty) * (t.side === 'Short' ? -1 : 1);
 return diff - num(t.fees);
 }
function resultOf(t) { const p = calcPnl(t);
 return p === null ? 'Open' : p > 0.0000001 ? 'Win' : p < -0.0000001 ? 'Loss' : 'Breakeven';
 }
function rMultiple(t) { const p = calcPnl(t);
 const r = num(t.risk);
 return p === null || r <= 0 ? null : p / r;
 }
function toast(msg) { const el=$('toast');
 el.textContent=msg;
 el.classList.add('show');
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
 }
function navigate(view) { document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 const titles={dashboard:'Ringkasan',trades:'Jurnal transaksi',market:'Pasar kripto',analytics:'Analisis',reviews:'Evaluasi harian',risk:'Kalkulator risiko'};
 $('crumbTitle').textContent=titles[view]||'Dashboard';
 $('sidebar').classList.remove('open');
 if(view==='dashboard') renderDashboard();
 if(view==='trades') renderTrades();
 if(view==='analytics') renderAnalytics();
 if(view==='reviews') renderReviews();
 if(view==='market'&&!marketCoins.length) loadMarket();
 window.scrollTo({top:0,behavior:'smooth'});
 }
function iconClass(pair) { const p=(pair||'').toUpperCase();
 if(p.startsWith('BTC'))return 'btc';
 if(p.startsWith('ETH'))return 'eth';
 return 'other';
 }
function pairSymbol(pair) { const p=(pair||'?').toUpperCase();
 return p.startsWith('BTC')?'₿':p.startsWith('ETH')?'◆':p.charAt(0);
 }
function pnlClass(p) { return p>0?'pnl-positive':p<0?'pnl-negative':'pnl-neutral';
 }
function tradeRow(t, recent=false) { const p=calcPnl(t), res=resultOf(t);
 const pair=esc(t.pair||'Unknown');
 const setup=esc(t.setup||'Tanpa strategi');
 const mkt=t.market==='Spot'?'Spot':'Futures';
 const lev=t.market==='Spot'?'':` · ${esc(t.leverage||1)}x`;
 return `<tr><td><div class="coin-cell"><span class="coin-icon ${iconClass(t.pair)}">${esc(pairSymbol(t.pair))}</span><span><b>${pair}</b><small>${mkt}${lev} · ${setup}</small></span></div></td><td><span class="tag ${t.side==='Short'?'short':'long'}">${t.side==='Short'?'Short':'Long'}</span></td>${recent?`<td>${setup}</td>`:`<td>${esc(t.entry||'—')} → ${esc(t.exit||'—')}</td>`}<td>${dateFmt(t.date)}</td>${recent?'':`<td>${rMultiple(t)===null?'—':(rMultiple(t)>0?'+':'')+rMultiple(t).toFixed(2)+'R'}</td>`}<td class="${p===null?'pnl-neutral':pnlClass(p)}">${p===null?'—':(p>0?'+':'')+esc(tradeMoney(t,p))}</td><td><span class="tag ${res==='Open'?'open':res==='Win'?'win':res==='Loss'?'loss':'closed'}">${res==='Breakeven'?'Impas':res==='Open'?'Terbuka':res==='Win'?'Untung':res==='Loss'?'Rugi':'Selesai'}</span></td>${recent?'':`<td><button class="text-button edit-trade" data-id="${esc(t.id)}">Buka / Edit</button><button class="text-button pdf-trade" data-pdf-id="${esc(t.id)}">PDF</button></td>`}</tr>`;
 }
function renderDashboard() { renderAccountBalances();
 const closed=closedTrades().filter(t=>t.market!=='Spot'&&tradeQuote(t)==='USDT').slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||0)-(b.createdAt||0));
 const spotClosed=closedTrades().filter(t=>t.market==='Spot'&&tradeQuote(t)==='IDR').slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||0)-(b.createdAt||0));
 const wins=closed.filter(t=>calcPnl(t)>0), losses=closed.filter(t=>calcPnl(t)<0), bes=closed.filter(t=>calcPnl(t)===0);
 const gp=wins.reduce((s,t)=>s+calcPnl(t),0), gl=Math.abs(losses.reduce((s,t)=>s+calcPnl(t),0)), net=closed.reduce((s,t)=>s+calcPnl(t),0), startBalance=Math.max(1,Number(accountSettings.usdtBalance)||0), returnPct=startBalance?net/startBalance*100:0;
 $('statPnl').textContent=(net>0?'+':'')+tradeMoney({market:'Futures',quote:'USDT'},net);
 $('statPnl').className='stat-value '+pnlClass(net);
 $('statPnlPct').textContent=Number(accountSettings.usdtBalance)>0?pct(returnPct):'Isi modal awal untuk melihat persentase';
 $('statWins').textContent=`${wins.length} untung / ${losses.length} rugi`;
  $('statWin').textContent=closed.length?((wins.length/closed.length)*100).toFixed(1)+'%':'—';
 $('statPF').textContent=gl? (gp/gl).toFixed(2) : gp>0?'∞':'—';
 let equity=Number(accountSettings.usdtBalance)||0, peak=equity, maxDD=0;
 const points=[equity];
 closed.forEach(t=>{equity+=calcPnl(t);peak=Math.max(peak,equity);if(peak>0)maxDD=Math.max(maxDD,(peak-equity)/peak*100);points.push(equity)});
 $('statDD').textContent=maxDD.toFixed(2)+'%';
 $('chartTotal').textContent=(Number(accountSettings.usdtBalance||0)+net).toLocaleString('id-ID',{maximumFractionDigits:2})+' USDT';
 $('chartCaption').textContent=closed.length?`${closed.length} posisi Futures · saldo awal + hasil terealisasi`:'Saldo awal · belum ada posisi Futures selesai';
 $('spotChartTotal').textContent=(Number(accountSettings.idrBalance||0)+spotClosed.reduce((s,t)=>s+calcPnl(t),0)).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
 $('spotChartCaption').textContent=spotClosed.length?`${spotClosed.length} transaksi Spot · saldo awal + hasil terealisasi`:'Saldo awal · belum ada transaksi Spot selesai';
 drawEquity(spotClosed.reduce((arr,t)=>{arr.push((arr.length?arr[arr.length-1]:Number(accountSettings.idrBalance)||0)+calcPnl(t));return arr;},[Number(accountSettings.idrBalance)||0]),'spotEquityChart');
 $('donutTotal').textContent=closed.length;
 $('donutWins').textContent=wins.length;
 $('donutLosses').textContent=losses.length;
 $('donutBE').textContent=bes.length;
 const total=Math.max(closed.length,1);
 const a=wins.length/total*360,b=a+losses.length/total*360;
 $('outcomeDonut').style.background=`conic-gradient(var(--green) 0deg ${a}deg,var(--red) ${a}deg ${b}deg,var(--orange) ${b}deg 360deg)`;
 drawEquity(points);
 const recent=trades.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0)).slice(0,5);
 $('recentTradesBody').innerHTML=recent.map(t=>tradeRow(t,true)).join('');
 $('recentEmpty').classList.toggle('show',recent.length===0);
 $('tradeCountBadge').textContent=trades.length;
 const tracked=trades.filter(t=>t.status==='Closed'&&t.rules!=='Not set');
 const adherent=tracked.filter(t=>t.rules==='Yes'||t.rules==='Mostly');
 const d=tracked.length?Math.round(adherent.length/tracked.length*100):null;
 $('disciplineValue').innerHTML=d===null?'—':' '+d+'%<small> adherence</small>';
 $('disciplineBar').style.width=(d||0)+'%';
 $('disciplineNote').textContent=d===null?'Log rule compliance in each trade to see this metric.':`${adherent.length} of ${tracked.length} recorded closed trades were marked as following your plan.`;
 }
function drawEquity(points,chartId='equityChart') { const svg=$(chartId);
 if(!points.length){svg.innerHTML='<text x="360" y="110" text-anchor="middle" fill="#7d8792" font-size="12">Belum ada data transaksi selesai</text>';
return;
} const W=720,H=220,pad=18,min=Math.min(0,...points),max=Math.max(0,...points),range=max-min||1;
 const coords=points.map((v,i)=>[pad+(points.length===1?0:i/(points.length-1))*(W-pad*2),H-pad-((v-min)/range)*(H-pad*2)]);
 const line=coords.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
 const area=line+` L ${coords[coords.length-1][0]} ${H-pad} L ${coords[0][0]} ${H-pad} Z`;
 const color=points[points.length-1]>=0?'#68d69b':'#ff8585';
 const y0=H-pad-(0-min)/range*(H-pad*2);
 svg.innerHTML=`<defs><linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".22"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><line x1="0" y1="${y0}" x2="720" y2="${y0}" stroke="#29323a" stroke-dasharray="4 5"/><path d="${area}" fill="url(#eqfill)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${coords.length<50?coords.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${color}"/>`).join(''):''}`; }
function renderTrades() { const q=$('tradeSearch').value.trim().toLowerCase(), market=$('filterMarket').value, side=$('filterSide').value, status=$('filterStatus').value, result=$('filterResult').value; const list=trades.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||0)-(a.createdAt||0)).filter(t=>(market==='all'||(market==='Futures'?t.market!=='Spot':t.market===market))&&(!q||[t.pair,t.setup,t.notes,t.side].join(' ').toLowerCase().includes(q))&&(side==='all'||t.side===side)&&(status==='all'||t.status===status)&&(result==='all'||resultOf(t)===result)); $('tradesBody').innerHTML=list.map(t=>tradeRow(t,false)).join(''); $('tradesEmpty').classList.toggle('show',list.length===0); $('tradeFootCount').textContent=`${list.length} of ${trades.length} trades`; document.querySelectorAll('.edit-trade').forEach(b=>b.addEventListener('click',()=>openTrade(b.dataset.id))); document.querySelectorAll('.pdf-trade').forEach(b=>b.addEventListener('click',()=>exportSingleTradePDF(b.dataset.pdfId))); }
function renderAnalytics() { const c=closedTrades().filter(t=>t.market!=='Spot'&&tradeQuote(t)==='USDT'),p=c.map(calcPnl),wins=p.filter(x=>x>0),losses=p.filter(x=>x<0),sum=p.reduce((a,b)=>a+b,0),rs=c.map(rMultiple).filter(x=>x!==null); $('anaExpectancy').textContent=c.length?money(sum/c.length):'—';
 $('anaAvgWin').textContent=wins.length?money(wins.reduce((a,b)=>a+b,0)/wins.length):'—';
 $('anaAvgLoss').textContent=losses.length?money(losses.reduce((a,b)=>a+b,0)/losses.length):'—';
 $('anaAvgR').textContent=rs.length?(rs.reduce((a,b)=>a+b,0)/rs.length).toFixed(2)+'R':'—';
 const setups={};
 c.forEach(t=>{const k=t.setup||'Unspecified';setups[k]=(setups[k]||0)+calcPnl(t)});
 const pairs=Object.entries(setups).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
 const max=Math.max(1,...pairs.map(x=>Math.abs(x[1])));
 $('setupBreakdown').innerHTML=pairs.length?pairs.map(([name,val])=>`<div class="setup-row"><div class="setup-row-head"><span>${esc(name)}</span><b class="${pnlClass(val)}">${val>0?'+':''}${money(val)}</b></div><div class="bar-track"><span style="width:${Math.max(2,Math.abs(val)/max*100)}%;background:${val<0?'var(--red)':'var(--green)'}"></span></div></div>`).join(''):'<div class="review-empty">Record closed trades with setup names to compare strategies.</div>';
 $('sideBreakdown').innerHTML=['Long','Short'].map(side=>{const arr=c.filter(t=>t.side===side),v=arr.reduce((s,t)=>s+calcPnl(t),0);return `<div class="side-item"><span class="side-symbol">${side==='Long'?'↗':'↘'}</span><div><b>${side}</b><small>${arr.length} closed trade${arr.length===1?'':'s'}</small></div><strong class="${pnlClass(v)}">${v>0?'+':''}${money(v)}</strong></div>`}).join('');
 let eq=0,peak=0,dd=0;
 c.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(t=>{eq+=calcPnl(t);peak=Math.max(peak,eq);if(peak>0)dd=Math.max(dd,(peak-eq)/peak*100)});
 const gp=wins.reduce((a,b)=>a+b,0),gl=Math.abs(losses.reduce((a,b)=>a+b,0));
 const rows=[['Total trades',c.length],['Winning trades',wins.length],['Losing trades',losses.length],['Breakeven trades',p.filter(x=>x===0).length],['Gross profit',money(gp)],['Gross loss',money(gl)],['Profit factor',gl?(gp/gl).toFixed(2):gp>0?'∞':'—'],['Max drawdown',dd.toFixed(2)+'%'],['Total recorded trades',trades.length],['Open trades',trades.filter(t=>t.status==='Open').length]];
 $('statsList').innerHTML=rows.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('');
 }
function renderReviews() { $('reviewCount').textContent=`${reviews.length} ENTRIES`;
 const list=reviews.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 $('reviewHistory').innerHTML=list.length?list.map(r=>`<div class="review-entry"><div class="review-entry-top"><b>${dateFmt(r.date)} · ${esc(r.mood)}</b><span>${esc(r.adherence)}</span></div>${r.mistake&&r.mistake!=='None identified'?`<p><b>Focus:</b> ${esc(r.mistake)}</p>`:''}${r.good?`<p><b>Went well:</b> ${esc(r.good)}</p>`:''}${r.improve?`<p><b>Improve:</b> ${esc(r.improve)}</p>`:''}${r.lesson?`<p><b>Pelajaran:</b> ${esc(r.lesson)}</p>`:''}${r.freeform?`<p class="review-freeform"><b>Catatan bebas:</b><br>${esc(r.freeform).replace(/\n/g,'<br>')}</p>`:''}<div class="review-actions"><button data-edit-review="${esc(r.id)}">Edit</button><button data-delete-review="${esc(r.id)}">Delete</button></div></div>`).join(''):'<div class="review-empty">No reviews yet. Start with one lesson from today.</div>';
 document.querySelectorAll('[data-edit-review]').forEach(b=>b.onclick=()=>editReview(b.dataset.editReview));
 document.querySelectorAll('[data-delete-review]').forEach(b=>b.onclick=()=>{if(confirm('Hapus evaluasi ini dari semua perangkat yang tersinkron?')){deletedRecords=[...new Set([...deletedRecords,'review:'+b.dataset.deleteReview])];reviews=reviews.filter(r=>r.id!==b.dataset.deleteReview);persist();renderReviews();toast('Evaluasi dihapus.')}});
 }
function clearTradeForm() { $('tradeForm').reset();
 $('tradeMarket').value='Spot';
 $('tradeQuote').value='IDR';
 $('tradePair').value='BTC/IDR';
 updateTradeCurrencyLabels();
 $('tradeId').value='';
 $('tradeModalTitle').textContent='Add new trade';
 $('deleteTradeBtn').classList.add('hidden');
 $('tradeDate').value=new Date().toISOString().slice(0,10);
 $('tradeLeverage').value='1';
 $('tradeFees').value='0';
 $('tradeManualPnl').value='';
 $('tradeRisk').value='';
 currentImageData='';
 $('imagePreview').hidden=true;
 $('imagePreview').src='';
 }
function openTrade(id='') { clearTradeForm();
 if(id){const t=trades.find(x=>x.id===id);
if(!t)return;
 $('tradeModalTitle').textContent='Edit trade';
$('deleteTradeBtn').classList.remove('hidden');
 const map={tradeId:'id',tradePair:'pair',tradeMarket:'market',tradeQuote:'quote',tradeSide:'side',tradeStatus:'status',tradeSetup:'setup',tradeTimeframe:'timeframe',tradeEntry:'entry',tradeExit:'exit',tradeQty:'qty',tradeLeverage:'leverage',tradeStop:'stop',tradeTarget:'target',tradeFees:'fees',tradeManualPnl:'manualPnl',tradeRisk:'risk',tradeDate:'date',tradeRules:'rules',tradeEmotion:'emotion',tradeNotes:'notes'};
 Object.entries(map).forEach(([field,key])=>{if(t[key]!==undefined&&t[key]!==null)$(field).value=t[key]});
 currentImageData=t.image||'';
if(currentImageData){$('imagePreview').src=currentImageData;
$('imagePreview').hidden=false;
} } updateTradeCurrencyLabels();
$('tradeDialog').showModal();
 }
function formValue(id) { const el = $(id);
 return el ? String(el.value ?? '').trim() : '';
 }
function updateTradeCurrencyLabels(){const market=$('tradeMarket')?.value||'Spot',quote=$('tradeQuote')?.value||'USDT';
$('tradeFeesLabel').textContent=`Biaya + funding (${quote})`;
$('tradeManualPnlLabel').textContent=`P/L bersih manual (${quote})`;
$('tradeQuoteHelp').textContent=market==='Spot'?'Spot umumnya BTC/IDR atau ETH/IDR.':'Futures umumnya BTC/USDT; leverage dicatat untuk konteks margin.';
if(!$('tradeId').value){const pair=$('tradePair').value.toUpperCase();
const base=(pair.split('/')[0]||'BTC').replace(/[^A-Z0-9]/g,'')||'BTC';
$('tradePair').value=base+'/'+quote;
}}
$('tradeQuote').disabled=true;
$('tradeMarket').addEventListener('change',()=>{const market=$('tradeMarket').value,quote=market==='Spot'?'IDR':'USDT',base=($('tradePair').value.toUpperCase().split('/')[0]||'BTC').replace(/[^A-Z0-9]/g,'')||'BTC';$('tradeQuote').value=quote;$('tradePair').value=base+'/'+quote;updateTradeCurrencyLabels();});
$('tradeForm').addEventListener('submit',e=>{e.preventDefault();const id=formValue('tradeId'),status=formValue('tradeStatus'),exit=formValue('tradeExit');if(status==='Closed'&&exit===''){toast('Add an exit price for a closed trade, or mark it Open.');return;}const t={id:id||uid(),createdAt:id?(trades.find(x=>x.id===id)?.createdAt||Date.now()):Date.now(),updatedAt:Date.now(),pair:formValue('tradePair').toUpperCase().replace(/\s/g,''),market:formValue('tradeMarket'),quote:formValue('tradeQuote'),side:formValue('tradeSide'),status,setup:formValue('tradeSetup'),timeframe:formValue('tradeTimeframe'),entry:formValue('tradeEntry'),exit,qty:formValue('tradeQty'),leverage:formValue('tradeLeverage'),stop:formValue('tradeStop'),target:formValue('tradeTarget'),fees:formValue('tradeFees')||'0',manualPnl:formValue('tradeManualPnl'),risk:formValue('tradeRisk'),date:formValue('tradeDate'),rules:formValue('tradeRules'),emotion:formValue('tradeEmotion'),notes:formValue('tradeNotes'),image:currentImageData};if(t.status==='Closed'&&t.manualPnl===''&&t.qty==='' ){toast('Enter position quantity or manual net P/L to calculate results.');return;}if(id){const i=trades.findIndex(x=>x.id===id);if(i>=0)trades[i]=t;}else trades.push(t);if(!persist())return;$('tradeDialog').close();renderAll();toast(id?'Jurnal transaksi diperbarui.':'Jurnal transaksi berhasil disimpan.');});
$('deleteTradeBtn').addEventListener('click',()=>{const id=formValue('tradeId');if(id&&confirm('Hapus jurnal transaksi ini dari semua perangkat yang tersinkron?')){deletedRecords=[...new Set([...deletedRecords,'trade:'+id])];trades=trades.filter(t=>t.id!==id);persist();$('tradeDialog').close();renderAll();toast('Jurnal transaksi dihapus.');}});
$('tradeImage').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;if(f.size>1200000){toast('Image is over 1.2 MB. Please compress it first to protect browser storage.');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{currentImageData=reader.result;$('imagePreview').src=currentImageData;$('imagePreview').hidden=false;};reader.readAsDataURL(f);});
function resetReviewForm(){ $('reviewForm').reset();
$('reviewId').value='';
$('reviewDate').value=new Date().toISOString().slice(0,10);
 }
$('reviewForm').addEventListener('submit',e=>{e.preventDefault();const id=formValue('reviewId');const r={id:id||uid(),createdAt:id?(reviews.find(x=>x.id===id)?.createdAt||Date.now()):Date.now(),updatedAt:Date.now(),date:formValue('reviewDate'),mood:formValue('reviewMood'),adherence:formValue('reviewAdherence'),mistake:formValue('reviewMistake'),good:formValue('reviewGood'),improve:formValue('reviewImprove'),lesson:formValue('reviewLesson'),freeform:formValue('reviewFreeform')};if(id){const i=reviews.findIndex(x=>x.id===id);if(i>=0)reviews[i]=r;}else reviews.push(r);if(!persist())return;renderReviews();resetReviewForm();toast('Evaluasi harian disimpan.');});
function editReview(id){const r=reviews.find(x=>x.id===id);
if(!r)return;
$('reviewId').value=r.id;
$('reviewDate').value=r.date;
$('reviewMood').value=r.mood;
$('reviewAdherence').value=r.adherence;
$('reviewMistake').value=r.mistake;
$('reviewGood').value=r.good;
$('reviewImprove').value=r.improve;
$('reviewLesson').value=r.lesson;
$('reviewFreeform').value=r.freeform||'';
window.scrollTo({top:0,behavior:'smooth'});
}
$('resetReview').onclick=resetReviewForm;
$('newReviewBtn').onclick=()=>{resetReviewForm();
$('reviewDate').value=new Date().toISOString().slice(0,10);
$('reviewGood').focus();
};
$('quickReviewBtn').onclick=()=>{navigate('reviews');
resetReviewForm();
};
$('shortcutReview').onclick=()=>{navigate('reviews');
resetReviewForm();
};
$('riskForm').addEventListener('submit',e=>{e.preventDefault();const balance=num($('riskBalance').value),riskPct=num($('riskPercent').value)/100,entry=num($('riskEntry').value),stop=num($('riskStop').value),target=num($('riskTarget').value),feePct=num($('riskFee').value)/100;if(balance<=0||entry<=0||stop<=0||entry===stop||riskPct<=0||riskPct>1){toast('Check balance, risk, entry, and stop-loss values.');return;}const distance=Math.abs(entry-stop)/entry;const riskAmount=balance*riskPct;const riskPerUnit=Math.abs(entry-stop)+entry*feePct+stop*feePct;const qty=riskAmount/riskPerUnit;const notional=qty*entry;const reward=target>0?Math.abs(target-entry)*qty-(entry+target)*qty*feePct:null;const rr=target>0?Math.abs(target-entry)/(Math.abs(entry-stop)||1):null;$('riskAmount').innerHTML=money(riskAmount)+`<small>USDT planned risk · ${pct(riskPct*100)}</small>`;$('riskNotional').textContent=money(notional);$('riskQuantity').textContent=qty.toLocaleString('en-US',{maximumFractionDigits:8});$('riskReward').textContent=reward===null?'—':money(reward);$('riskRR').textContent=rr===null?'—':'1 : '+rr.toFixed(2);});
function exportData(){const blob=new Blob([JSON.stringify({app:'Edge Journal',version:1,exportedAt:new Date().toISOString(),trades,reviews},null,2)],{type:'application/json'});
downloadBlob(blob,`edge-journal-backup-${new Date().toISOString().slice(0,10)}.json`);
toast('Backup exported. Keep it somewhere private.');
}
function downloadBlob(blob,name){const a=document.createElement('a');
a.href=URL.createObjectURL(blob);
a.download=name;
a.click();
setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function exportCSV(){const cols=['date','pair','market','quote','side','status','setup','timeframe','entry','exit','qty','leverage','stop','target','fees','netPnl','risk','rules','emotion','notes'];
const rows=[cols.join(','),...trades.map(t=>cols.map(k=>{let v=k==='netPnl'?calcPnl(t):t[k]??'';return '"'+String(v).replace(/"/g,'""')+'"';}).join(','))];
downloadBlob(new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),`edge-journal-trades-${new Date().toISOString().slice(0,10)}.csv`);
toast('Data CSV berhasil diekspor.');
}
$('exportBtn').onclick=exportData;
$('analyticsExport').onclick=exportCSV;
$('importBtn').onclick=()=>$('importFile').click();

// Impor Excel/CSV: nama kolom dipetakan otomatis ke skema jurnal Edge Journal.
const IMPORT_ALIASES = {
  date: ['date','tanggal','trade date','open date','open time','entry date','waktu buka','waktu masuk','created at','close date','close time','tanggal transaksi','timestamp'],
  pair: ['pair','symbol','trading pair','contract','instrument','simbol','pasangan','koin','aset'],
  market: ['market type','type','market category','jenis pasar','pasar','product type','trade type'],
  quote: ['quote','quote asset','settlement asset','margin asset','mata uang','mata uang harga','asset quote'],
  side: ['side','direction','position side','arah','posisi','long short','buy sell'],
  status: ['status','position status','state','status posisi'],
  setup: ['strategy','setup','strategi','setup name'],
  timeframe: ['timeframe','time frame','tf','kerangka waktu'],
  entry: ['entry','entry price','avg entry price','average entry price','open price','buy price','harga masuk','harga entry','price in'],
  exit: ['exit','exit price','avg exit price','average exit price','close price','sell price','harga keluar','harga exit','price out'],
  qty: ['qty','quantity','size','position size','amount','filled quantity','executed qty','quantity btc','jumlah','jumlah aset','volume'],
  leverage: ['leverage','lever','leverage x','margin leverage'],
  stop: ['stop loss','stoploss','sl','stop price','harga sl'],
  target: ['take profit','target','target price','tp','harga tp'],
  fees: ['fees','fee','commission','trading fee','funding fee','funding','biaya','biaya transaksi'],
  pnl: ['net pnl','pnl','realized pnl','realized profit','realized p&l','profit loss','profit/loss','net profit','closed pnl','realized profit usdt','income','laba rugi','hasil bersih','p/l','profit'],
  risk: ['risk','risk amount','risk amount usdt','risiko'],
  rules: ['rules','plan adherence','kepatuhan rencana'],
  emotion: ['emotion','mood','emosi'],
  notes: ['notes','note','comment','remarks','catatan','alasan transaksi']
};
function normalizeHeader(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function headerMap(headers){const normalized=headers.map(h=>normalizeHeader(h));const out={};for(const [field,aliases] of Object.entries(IMPORT_ALIASES)){const accepted=aliases.map(normalizeHeader);let idx=normalized.findIndex(h=>accepted.includes(h));if(idx<0)idx=normalized.findIndex(h=>h.length>2&&accepted.some(a=>a.length>=3&&(h.includes(a)||a.includes(h))));if(idx>=0)out[field]=headers[idx];}return out;}
function cellText(v){if(v===null||v===undefined)return '';return String(v).trim();}
function numberCell(v){if(typeof v==='number')return Number.isFinite(v)?String(v):'';let s=cellText(v);if(!s)return '';s=s.replace(/\s/g,'').replace(/(IDR|USDT|USD|BTC|ETH|%)/ig,'');if(s.includes(',')&&s.includes('.')){s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');}else if(s.includes(',')&&!s.includes('.')){const parts=s.split(',');s=parts.length===2&&parts[1].length<=2?s.replace(',','.'):s.replace(/,/g,'');}s=s.replace(/[^0-9.+-]/g,'');return s!==''&&Number.isFinite(Number(s))?String(Number(s)):'';}
function normalizeImportDate(v){if(v===null||v===undefined||v==='')return new Date().toISOString().slice(0,10);if(typeof v==='number'&&window.XLSX?.SSF){const d=window.XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);if(m){let a=Number(m[1]),b=Number(m[2]),y=Number(m[3]);if(y<100)y+=y<70?2000:1900;let day=a,month=b;if(a<=12&&b>12){day=b;month=a;}return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}const d=new Date(s);return Number.isNaN(+d)?new Date().toISOString().slice(0,10):d.toISOString().slice(0,10);}
function normalizePair(raw,quote){let p=String(raw||'BTC').toUpperCase().replace(/\s/g,'').replace(/:USDT$/,'').replace(/[-_]/g,'/');if(!p.includes('/')){const q=quote||(['IDR','USDT','USDC','BUSD','USD','BTC','ETH'].find(x=>p.endsWith(x)&&p.length>x.length)||'USDT');if(p.endsWith(q)&&p.length>q.length)p=p.slice(0,-q.length)+'/'+q;}if(p.includes('/')){const parts=p.split('/');return `${parts[0]}/${parts[1]||quote||'USDT'}`;}return p;}
function importSignature(t){if(t.sourceOrderId)return `exchange-order|${String(t.sourceOrderId).trim()}`;return [t.date,t.pair,t.market,t.side,t.entry,t.exit,t.qty,t.manualPnl].map(x=>String(x??'').trim().toLowerCase()).join('|');}
function mapSheetRows(rows){if(!rows.length)throw new Error('Sheet Excel kosong.');const headers=rows[0].map((h,i)=>cellText(h)||`Kolom ${i+1}`);const mapping=headerMap(headers);if(!mapping.pair&&!mapping.entry&&!mapping.pnl)throw new Error('Kolom belum dikenali. Pastikan baris pertama berisi judul seperti Pair/Symbol, Entry Price, Exit Price, Quantity, PnL, atau Date.');const get=(row,field)=>mapping[field]===undefined?'':row[headers.indexOf(mapping[field])];const result=[];let skipped=0;for(const row of rows.slice(1)){if(!row||row.every(v=>cellText(v)===''))continue;const rawPair=cellText(get(row,'pair'))||'BTC/USDT';const rawMarket=cellText(get(row,'market')).toLowerCase();const rawQuote=cellText(get(row,'quote')).toUpperCase();let quote=rawQuote||(/\bIDR\b/i.test(rawPair)?'IDR':'USDT');let market=/spot|cash|現物/i.test(rawMarket)?'Spot':/future|perpetual|swap|derivative|contract/i.test(rawMarket)?'Futures':quote==='IDR'?'Spot':'Futures';if(market==='Spot'&&quote==='USDT'&&/IDR/i.test(rawPair))quote='IDR';if(market==='Futures'&&!['USDT','USDC','USD','BUSD'].includes(quote))quote='USDT';const pair=normalizePair(rawPair,quote);const sideRaw=cellText(get(row,'side')).toLowerCase();const side=/short|sell|jual/i.test(sideRaw)?'Short':'Long';const entry=numberCell(get(row,'entry'));const exit=numberCell(get(row,'exit'));const qty=numberCell(get(row,'qty'));const pnl=numberCell(get(row,'pnl'));const statusRaw=cellText(get(row,'status')).toLowerCase();const status=/open|opened|ongoing|terbuka|aktif/i.test(statusRaw)?'Open':(/closed|close|done|complete|selesai|filled/i.test(statusRaw)||exit!==''||pnl!=='')?'Closed':'Open';if(entry===''&&pnl===''){skipped++;continue;}const date=normalizeImportDate(get(row,'date'));const t={id:uid(),createdAt:Date.now(),updatedAt:Date.now(),date,pair,market,quote,side,status,setup:cellText(get(row,'setup')),timeframe:cellText(get(row,'timeframe'))||'Other',entry,exit,qty,leverage:numberCell(get(row,'leverage'))||'1',stop:numberCell(get(row,'stop')),target:numberCell(get(row,'target')),fees:numberCell(get(row,'fees'))||'0',manualPnl:pnl,risk:numberCell(get(row,'risk')),rules:cellText(get(row,'rules'))||'Not set',emotion:cellText(get(row,'emotion'))||'Neutral',notes:cellText(get(row,'notes')),image:''};result.push(t);}return {trades:result,mapping:Object.keys(mapping),skipped,headers,mappingDetails:mapping};}
function mapExchangeReportRows(rows){
  const headerIndex=rows.findIndex(row=>{const h=(row||[]).map(normalizeHeader);return h.includes('order date')&&h.includes('order number')&&h.includes('transaction')&&h.includes('product name')&&h.includes('status');});
  if(headerIndex<0)return null;
  const headers=rows[headerIndex].map((v,i)=>cellText(v)||`Kolom ${i+1}`);
  const norm=headers.map(normalizeHeader);
  const idx=name=>norm.indexOf(normalizeHeader(name));
  const col={date:idx('Order Date'),time:idx('Order Time'),id:idx('Order Number'),transaction:idx('Transaction'),action:idx('Transaction Type'),asset:idx('Product Name'),orderType:idx('Order Type'),status:idx('Status'),currency:idx('Currency'),price:idx('Order Price'),trigger:idx('Trigger Price'),qty:idx('Quantity'),fees:idx('Fees'),taxes:idx('Taxes'),tp:idx('TP'),sl:idx('SL'),source:idx('Source'),paidFrom:idx('Paid From'),paidTo:idx('Paid To'),conversion:idx('USD-IDR Conversion Rate*')};
  const get=(row,key)=>col[key]>=0?row[col[key]]:'';
  const result=[];let skipped=0;let seenRows=0;
  for(const row of rows.slice(headerIndex+1)){
    if(!row||row.every(v=>cellText(v)===''))continue;seenRows++;
    const transaction=cellText(get(row,'transaction')).toLowerCase();
    const action=cellText(get(row,'action')).toUpperCase();
    const status=cellText(get(row,'status')).toUpperCase();
    const isSpot=transaction==='crypto';const isFutures=transaction==='crypto futures';
    if((!isSpot&&!isFutures)||!['BUY','SELL'].includes(action)||!['SUCCESS','PARTIALLY_FILLED','COMPLETED'].includes(status)){skipped++;continue;}
    const assetRaw=cellText(get(row,'asset')).toUpperCase();const currency=cellText(get(row,'currency')).toUpperCase()|| (isFutures?'USDT':'IDR');
    const price=numberCell(get(row,'price'));const qty=numberCell(get(row,'qty'));
    if(!assetRaw||price===''||qty===''||Number(qty)===0){skipped++;continue;}
    const market=isFutures?'Futures':'Spot';const quote=isFutures?'USDT':currency;
    const base=isFutures?assetRaw.replace(/[-_/]?PERP$/i,'').replace(/[-_/]/g,''):assetRaw;
    const pair=isFutures?normalizePair(base,quote):`${base}/${quote}`;
    const date=normalizeImportDate(get(row,'date'));
    const fee=(Number(numberCell(get(row,'fees'))||0)+Number(numberCell(get(row,'taxes'))||0)).toString();
    const orderId=cellText(get(row,'id'))||`${date}-${cellText(get(row,'time'))}-${assetRaw}-${action}`;
    const notes=[`Impor riwayat exchange · aksi: ${action}`,`Status order sumber: ${status}`,`Nomor order: ${orderId}`,`Jenis order: ${cellText(get(row,'orderType'))||'—'}`,get(row,'trigger')!==''?`Harga pemicu: ${cellText(get(row,'trigger'))}`:'',get(row,'source')!==''?`Sumber: ${cellText(get(row,'source'))}`:'',get(row,'paidFrom')!==''?`Dana dari: ${cellText(get(row,'paidFrom'))}`:'',get(row,'paidTo')!==''?`Dana ke: ${cellText(get(row,'paidTo'))}`:'',get(row,'conversion')!==''?`Kurs USD-IDR sumber: ${cellText(get(row,'conversion'))}`:'',isFutures?'Arah posisi perkiraan dari BUY/SELL. Periksa kembali apakah order ini membuka atau menutup posisi; leverage tidak tersedia di laporan.':'Order Spot diimpor sebagai catatan order, bukan pasangan posisi yang sudah dihitung P/L-nya.'].filter(Boolean).join(' · ');
    result.push({id:uid(),sourceOrderId:orderId,createdAt:Date.now(),updatedAt:Date.now(),date,pair,market,quote,side:isFutures?(action==='SELL'?'Short':'Long'):'Long',status:'Open',setup:`Impor ${market} ${action}`,timeframe:'Other',entry:price,exit:'',qty,leverage:'1',stop:numberCell(get(row,'sl')),target:numberCell(get(row,'tp')),fees:fee,manualPnl:'',risk:'',rules:'Not set',emotion:'Neutral',notes,image:''});
  }
  if(!result.length)throw new Error(`Format laporan transaksi terdeteksi, tetapi tidak ada order Crypto/Futures berstatus SUCCESS atau PARTIALLY_FILLED yang bisa diimpor. ${skipped} baris dilewati.`);
  return {trades:result,mapping:['Order Date → Tanggal','Product Name → Pair','Transaction → Jenis pasar','Transaction Type → Aksi order','Order Price → Harga masuk','Quantity → Jumlah aset','Fees + Taxes → Biaya','TP / SL → Target / Stop Loss'],skipped,headers,mappingDetails:col,reportType:'Laporan Riwayat Transaksi'};
}
async function importExcelFile(file){if(!window.XLSX)throw new Error('Pembaca Excel/CSV belum dimuat. Periksa internet lalu muat ulang halaman.');const buffer=await file.arrayBuffer();const workbook=window.XLSX.read(buffer,{type:'array',cellDates:false});if(!workbook.SheetNames.length)throw new Error('Tidak ada sheet di file ini.');let chosen=workbook.SheetNames[0];const preferred=workbook.SheetNames.find(n=>/trade|journal|transaksi|history|order/i.test(n));if(preferred)chosen=preferred;const sheet=workbook.Sheets[chosen];const rows=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:false});const mapped=mapExchangeReportRows(rows)||mapSheetRows(rows);if(!mapped.trades.length)throw new Error(`Tidak ada baris transaksi yang bisa diimpor. ${mapped.skipped} baris kosong/tidak dikenali dilewati.`);const known=new Set(trades.map(importSignature));const fresh=mapped.trades.filter(t=>!known.has(importSignature(t)));const duplicateCount=mapped.trades.length-fresh.length;const preview=fresh.slice(0,3).map(t=>`${t.date} · ${t.pair} · ${t.market} · ${t.side} · masuk ${t.entry||'—'} · P/L ${t.manualPnl||'otomatis'}`).join('\n');const mappingLabel=mapped.mapping.join(', ');const caveat=mapped.reportType?'\n\nCATATAN: File ini adalah riwayat ORDER exchange, bukan jurnal posisi lengkap. Order yang diimpor disimpan sebagai draft Terbuka tanpa P/L otomatis. Order Spot SELL tidak dianggap posisi Short. Untuk Futures, arah BUY/SELL hanya perkiraan dan leverage tidak tersedia di file; periksa/edit sebelum memakai statistik.':'';const message=`Format: ${mapped.reportType||chosen}\nTransaksi terbaca: ${mapped.trades.length}\nTransaksi baru: ${fresh.length}\nDuplikat dilewati: ${duplicateCount}\nBaris dilewati (mis. batal/top up/transfer): ${mapped.skipped}\nKolom dikenali: ${mappingLabel}\n\nContoh hasil pemetaan:\n${preview||'(tidak ada transaksi baru)'}${caveat}\n\nImpor transaksi baru ke jurnal?`;if(!fresh.length){toast(`Tidak ada transaksi baru. ${duplicateCount} data sudah ada di jurnal.`);return;}if(!confirm(message))return;trades=[...trades,...fresh];if(!persist())return;renderAll();toast(`${fresh.length} transaksi berhasil diimpor dari ${file.name}.`);}
$('importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const lower=file.name.toLowerCase();if(lower.endsWith('.json')){const data=JSON.parse(await file.text());if(!Array.isArray(data.trades))throw new Error('Backup JSON tidak memiliki daftar trades.');if(!confirm(`Impor ${data.trades.length} transaksi dan ${(data.reviews||[]).length} evaluasi dari backup?`))return;const merge=(old,inc)=>{const m=new Map(old.map(x=>[x.id,x]));inc.forEach(x=>m.set(x.id||uid(),x));return [...m.values()];};trades=merge(trades,data.trades);reviews=merge(reviews,data.reviews||[]);persist();renderAll();toast('Backup JSON berhasil diimpor.');}else{await importExcelFile(file);}}catch(err){console.error('Impor jurnal gagal:',err);toast(err.message||'File tidak dapat dibaca. Periksa format dan judul kolom.');}finally{e.target.value='';}});
$('githubBtn').onclick=()=>openGitHubSettings();
$('githubOpenBtn').onclick=()=>{const cfg=getGitHubConfig()||GITHUB_DEFAULTS;
window.open(cfg.pagesUrl||`https://${cfg.owner}.github.io/${cfg.repo}/`,'_blank','noopener,noreferrer');
};
$('githubTestBtn').addEventListener('click',async()=>{const cfg=readGitHubForm();try{await testGitHubConnection(cfg);}catch(err){setGitHubStatus(err.message,'error');toast('Test koneksi gagal: '+err.message);}});
$('githubForm').addEventListener('submit',saveGitHubSettings);
$('newTradeTop').onclick=()=>openTrade();
$('newTradePage').onclick=()=>openTrade();
$('emptyAddTrade').onclick=()=>openTrade();
$('emptyAddTrade2').onclick=()=>openTrade();
$('shortcutTrade').onclick=()=>openTrade();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
['tradeSearch','filterMarket','filterSide','filterStatus','filterResult'].forEach(id=>$(id).addEventListener(id==='tradeSearch'?'input':'change',renderTrades));
$('mobileMenu').onclick=()=>$('sidebar').classList.toggle('open');
document.addEventListener('click',e=>{if(window.innerWidth<=800&&$('sidebar').classList.contains('open')&&!$('sidebar').contains(e.target)&&!$('mobileMenu').contains(e.target))$('sidebar').classList.remove('open');});
function renderAll(){renderDashboard();
renderTrades();
renderAnalytics();
renderReviews();
}
function compactMoney(v){if(!Number.isFinite(Number(v)))return '—';
const n=Number(v);
if(Math.abs(n)>=1e12)return '$'+(n/1e12).toFixed(2)+'T';
if(Math.abs(n)>=1e9)return '$'+(n/1e9).toFixed(2)+'B';
if(Math.abs(n)>=1e6)return '$'+(n/1e6).toFixed(2)+'M';
if(Math.abs(n)>=1e3)return '$'+(n/1e3).toFixed(2)+'K';
return '$'+n.toLocaleString('en-US',{maximumFractionDigits:2});
}
function marketPrice(v){if(!Number.isFinite(Number(v)))return '—';
return '$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:Number(v)<1?8:2});
}
async function loadMarket(){if(marketLoading)return;
marketLoading=true;
const body=$('marketBody');
$('marketError').hidden=true;
$('marketUpdated').textContent='Fetching latest available data…';
$('refreshMarketBtn').disabled=true;
body.innerHTML='<tr><td colspan="7" class="market-message">Loading top market data…</td></tr>';
try{const res=await fetch('https://api.coinpaprika.com/v1/tickers?quotes=USD',{headers:{'accept':'application/json'}});
if(!res.ok)throw new Error('Market provider returned HTTP '+res.status);
const data=await res.json();
marketCoins=data.filter(c=>c.rank>0&&c.quotes&&c.quotes.USD).sort((a,b)=>a.rank-b.rank).slice(0,100);
if(!marketCoins.length)throw new Error('No market data was returned.');
$('marketUpdated').textContent='Updated '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · refreshes every 90 seconds';
renderMarket();
}catch(err){body.innerHTML='<tr><td colspan="7" class="market-message">Could not load market data.</td></tr>';
$('marketError').hidden=false;
$('marketError').textContent='Market data could not be fetched. Check your connection or try again later. '+err.message;
$('marketUpdated').textContent='Market data unavailable';
}finally{marketLoading=false;
$('refreshMarketBtn').disabled=false;
}}
function renderMarket(){const q=($('marketSearch')?.value||'').trim().toLowerCase(),limit=Number($('marketLimit')?.value||50);
const list=marketCoins.filter(c=>!q||c.name.toLowerCase().includes(q)||c.symbol.toLowerCase().includes(q)).slice(0,limit);
$('marketBody').innerHTML=list.length?list.map(c=>{const quote=c.quotes.USD,change=Number(quote.percent_change_24h||0),watched=watchedCoins.includes(c.id);return `<tr><td class="market-rank">${c.rank}</td><td><div class="market-asset">${c.logo?`<img class="coin-icon" src="${esc(c.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<span class="coin-icon">${esc(c.symbol.slice(0,3))}</span>`}<span><b>${esc(c.name)}</b><small>${esc(c.symbol)} · ${esc(c.id)}</small></span></div></td><td class="market-price">${marketPrice(quote.price)}</td><td class="${change>=0?'market-positive':'market-negative'}">${change>0?'+':''}${change.toFixed(2)}%</td><td class="market-number">${compactMoney(quote.market_cap)}</td><td class="market-number">${compactMoney(quote.volume_24h)}</td><td><button class="watch-btn ${watched?'is-watched':''}" data-watch="${esc(c.id)}" title="Toggle watchlist">${watched?'★':'☆'}</button> <button class="use-coin-btn" data-use-coin="${esc(c.symbol)}" title="Use in a new trade">＋ Trade</button></td></tr>`}).join(''):'<tr><td colspan="7" class="market-message">No coins match your search.</td></tr>';
document.querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>{const id=b.dataset.watch;watchedCoins=watchedCoins.includes(id)?watchedCoins.filter(x=>x!==id):[...watchedCoins,id];try{localStorage.setItem('edgeJournal.watchlist.v1',JSON.stringify(watchedCoins))}catch{}renderMarket();});
document.querySelectorAll('[data-use-coin]').forEach(b=>b.onclick=()=>{const c=marketCoins.find(x=>x.symbol.toLowerCase()===b.dataset.useCoin.toLowerCase());if(c){$('tradeMarket').value='Spot';$('tradeQuote').value='IDR';$('tradePair').value=c.symbol.toUpperCase()+'/IDR';updateTradeCurrencyLabels();$('tradeDialog').showModal();}});
}
$('refreshMarketBtn').addEventListener('click',loadMarket);
$('marketLimit').addEventListener('change',renderMarket);
$('marketSearch').addEventListener('input',renderMarket);
setInterval(()=>{if(document.visibilityState==='visible'&&document.getElementById('view-market').classList.contains('active'))loadMarket()},90000);
// Ambil perubahan dari perangkat lain secara berkala saat aplikasi sedang dibuka.
setInterval(()=>{const cfg=getGitHubConfig();if(document.visibilityState==='visible'&&cfg?.token&&!githubSyncBusy)syncJournalFromGitHub({quiet:true});},60000);

function exportSingleTradePDF(id){const t=trades.find(x=>x.id===id);
if(!t){toast('Jurnal tidak ditemukan.');
return;
}if(!window.jspdf?.jsPDF){toast('Pustaka PDF belum dimuat. Periksa internet lalu coba lagi.');
return;
}const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),p=calcPnl(t),q=tradeQuote(t);
doc.setFillColor(11,14,17);
doc.rect(0,0,210,36,'F');
doc.setTextColor(255,187,0);
doc.setFont('helvetica','bold');
doc.setFontSize(18);
doc.text('EDGE JOURNAL',14,15);
doc.setTextColor(245,245,245);
doc.setFontSize(10);
doc.text('LAPORAN JURNAL TRANSAKSI',14,23);
doc.setFont('helvetica','normal');
doc.setFontSize(8);
doc.text('Dibuat: '+new Date().toLocaleString('id-ID'),14,30);
doc.setTextColor(25,30,35);
doc.setFont('helvetica','bold');
doc.setFontSize(15);
doc.text(String(t.pair||'Pair tidak diketahui'),14,48);
doc.setFontSize(10);
doc.setFont('helvetica','normal');
doc.text(`${t.market==='Spot'?'SPOT':'FUTURES'} · ${t.side==='Short'?'SHORT':'LONG'} · ${t.date||'Tanggal tidak diisi'} · Status: ${t.status==='Open'?'Terbuka':'Selesai'}`,14,55);
doc.autoTable({startY:62,head:[['Detail','Nilai']],body:[['Harga masuk',String(t.entry||'—')+' '+q],['Harga keluar',String(t.exit||'—')+' '+q],['Jumlah aset',String(t.qty||'—')],['Leverage',t.market==='Spot'?'Tidak digunakan':String(t.leverage||1)+'x'],['Stop loss',String(t.stop||'—')],['Take profit',String(t.target||'—')],['Biaya / funding',String(t.fees||0)+' '+q],['Hasil bersih',p===null?'Belum terealisasi':tradeMoney(t,p)],['Strategi',t.setup||'—'],['Timeframe',t.timeframe||'—'],['Emosi',t.emotion||'—'],['Kepatuhan rencana',t.rules||'—']],theme:'grid',styles:{font:'helvetica',fontSize:9,cellPadding:3},headStyles:{fillColor:[32,43,52],textColor:[255,255,255]},columnStyles:{0:{cellWidth:55},1:{cellWidth:120}},margin:{left:14,right:14}});
let y=(doc.lastAutoTable?.finalY||62)+10;
doc.setFont('helvetica','bold');
doc.setFontSize(11);
doc.text('Grafik harga masuk dan keluar',14,y);
y+=6;
const x0=24,x1=186,baseY=y+36;
doc.setDrawColor(100,110,120);
doc.line(x0,baseY,x1,baseY);
doc.line(x0,y+2,x0,baseY);
const entry=Number(t.entry)||0,exit=Number(t.exit)||entry,low=Math.min(entry,exit,Number(t.stop)||entry,Number(t.target)||entry),high=Math.max(entry,exit,Number(t.stop)||entry,Number(t.target)||entry),range=high-low||1;
const yy=v=>baseY-((v-low)/range)*30;
doc.setDrawColor(70,150,230);
doc.setLineWidth(1.3);
doc.line(x0,yy(entry),x1,yy(exit));
doc.setFillColor(70,150,230);
doc.circle(x0,yy(entry),1.8,'F');
doc.circle(x1,yy(exit),1.8,'F');
doc.setFontSize(8);
doc.setTextColor(35,45,55);
doc.text('Masuk: '+String(t.entry||'—'),x0,baseY+7);
doc.text('Keluar: '+String(t.exit||'—'),x1,baseY+7,{align:'right'});
if(t.stop){doc.setDrawColor(220,75,75);
doc.setLineDash([2,2],0);
doc.line(x0,yy(Number(t.stop)),x1,yy(Number(t.stop)));
doc.setLineDash([],0);
doc.text('SL '+t.stop,x1,yy(Number(t.stop))-2,{align:'right'});
}if(t.target){doc.setDrawColor(50,160,110);
doc.setLineDash([2,2],0);
doc.line(x0,yy(Number(t.target)),x1,yy(Number(t.target)));
doc.setLineDash([],0);
doc.text('TP '+t.target,x1,yy(Number(t.target))-2,{align:'right'});
}y=baseY+17;
const noteLines=doc.splitTextToSize('Catatan / alasan transaksi: '+(t.notes||'Tidak ada catatan.'),180);
doc.setFont('helvetica','bold');
doc.text('Catatan transaksi',14,y);
doc.setFont('helvetica','normal');
doc.text(noteLines,14,y+6);
y+=9+noteLines.length*4;
if(y>255){doc.addPage();
y=20;
}const review=reviews.filter(r=>r.date===t.date).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];
if(review){doc.setFont('helvetica','bold');
doc.text('Evaluasi pada tanggal yang sama',14,y);
doc.setFont('helvetica','normal');
const txt=doc.splitTextToSize([review.freeform,review.good,review.improve,review.lesson].filter(Boolean).join('\n\n')||'Tidak ada catatan evaluasi.',180);
doc.text(txt,14,y+6);
}doc.setFontSize(7);
doc.setTextColor(120);
doc.text('Dokumen pribadi · Hasil dan grafik berdasarkan data yang dimasukkan manual.',14,287);
doc.save('edge-journal-'+String(t.pair||'trade').replace(/[^a-z0-9-]/gi,'-')+'-'+(t.date||'tanpa-tanggal')+'.pdf');
toast('PDF jurnal transaksi dibuat.');
}
function renderAccountBalances(){const idr=Number(accountSettings.idrBalance)||0,usdt=Number(accountSettings.usdtBalance)||0,rate=Number(accountSettings.usdtIdrRate)||16000;
const spot=pnlForMarket('Spot'),fut=pnlForMarket('Futures'),currentIDR=idr+spot,currentUSDT=usdt+fut;
$('balanceIDR').textContent=currentIDR.toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
$('balanceUSDT').textContent=currentUSDT.toLocaleString('id-ID',{maximumFractionDigits:2})+' USDT';
$('balanceUSDTIDR').textContent=(currentUSDT*rate).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
$('idrBalanceInput').value=idr;
$('usdtBalanceInput').value=usdt;
$('usdtRateInput').value=rate;
$('spotPnlBalance').textContent=spot.toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
$('futuresPnlBalance').textContent=usdt===0&&fut===0?'0.00 USDT':fut.toLocaleString('id-ID',{maximumFractionDigits:2})+' USDT';
}
$('saveBalancesBtn').addEventListener('click',()=>{accountSettings={idrBalance:Math.max(0,Number($('idrBalanceInput').value)||0),usdtBalance:Math.max(0,Number($('usdtBalanceInput').value)||0),usdtIdrRate:Math.max(1,Number($('usdtRateInput').value)||16000),updatedAt:Date.now()};localStorage.setItem(ACCOUNT_KEY,JSON.stringify(accountSettings));persist();renderDashboard();toast('Saldo dan kurs disimpan.');});
$('syncNowBtn').addEventListener('click',async()=>{const cfg=getGitHubConfig();if(!cfg?.token){openGitHubSettings();toast('Masukkan token GitHub pada setiap perangkat terlebih dahulu.');return;}await syncJournalFromGitHub();});

function exportJournalPDF(){if(!window.jspdf||!window.jspdf.jsPDF){toast('PDF library did not load. Check internet connection and retry.');
return;
}const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
const closed=closedTrades().filter(t=>t.market!=='Spot'&&tradeQuote(t)==='USDT'),net=closed.reduce((s,t)=>s+calcPnl(t),0),wins=closed.filter(t=>calcPnl(t)>0).length,losses=closed.filter(t=>calcPnl(t)<0).length;
const now=new Date();
doc.setFillColor(11,14,17);
doc.rect(0,0,297,36,'F');
doc.setTextColor(104,214,155);
doc.setFont('helvetica','bold');
doc.setFontSize(18);
doc.text('EDGE JOURNAL',14,15);
doc.setTextColor(232,237,242);
doc.setFontSize(10);
doc.text('JURNAL TRADING KRIPTO · LAPORAN PERFORMA',14,23);
doc.setFont('helvetica','normal');
doc.setFontSize(8);
doc.text('Dibuat '+now.toLocaleString('id-ID'),14,30);
doc.setTextColor(20,30,25);
doc.setFont('helvetica','bold');
doc.setFontSize(11);
doc.text('RINGKASAN PERFORMA FUTURES',14,46);
doc.setFont('helvetica','normal');
doc.setFontSize(9);
doc.text(`Total transaksi: ${trades.length}    Futures selesai: ${closed.length}    Wins: ${wins}    Losses: ${losses}    Win rate: ${closed.length?(wins/closed.length*100).toFixed(1)+'%':'—'}    Net P/L Futures: ${net.toFixed(2)} USDT`,14,53);
const rows=trades.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(t=>[t.date||'—',t.pair||'—',t.market||'—',t.side||'—',t.setup||'—',t.timeframe||'—',t.entry??'—',t.exit||'—',t.status||'—',t.status==='Closed'?tradeMoney(t,calcPnl(t)):'—',t.emotion||'—',t.rules||'—']);
doc.autoTable({startY:60,head:[['Tanggal','Pair','Pasar','Arah','Strategi','TF','Masuk','Keluar','Status','P/L bersih','Emosi','Rencana']],body:rows,theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:2.2,textColor:[40,48,55],lineColor:[220,226,230],lineWidth:.15,overflow:'linebreak'},headStyles:{fillColor:[23,58,43],textColor:[235,247,240],fontStyle:'bold'},alternateRowStyles:{fillColor:[245,248,246]},columnStyles:{9:{halign:'right'}} ,margin:{left:12,right:12}});
let y=(doc.lastAutoTable?.finalY||60)+10;
if(reviews.length){if(y>175){doc.addPage();
y=18;
}doc.setFont('helvetica','bold');
doc.setFontSize(11);
doc.text('CATATAN EVALUASI HARIAN',14,y);
y+=5;
const reviewRows=reviews.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(r=>[r.date||'—',r.mood||'—',r.adherence||'—',r.mistake||'—',r.good||'',r.improve||'',[r.lesson||'',r.freeform||''].filter(Boolean).join(' · ')]);
doc.autoTable({startY:y,head:[['Tanggal','Kondisi','Kepatuhan','Kesalahan','Berhasil','Perbaikan','Pelajaran']],body:reviewRows,theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:2.2,overflow:'linebreak'},headStyles:{fillColor:[23,58,43],textColor:[255,255,255]},margin:{left:12,right:12}});
}const pages=doc.getNumberOfPages();
for(let i=1;i<=pages;i++){doc.setPage(i);
doc.setFontSize(7);
doc.setTextColor(120);
doc.text('PRIVATE · Personal trading records',12,202);
doc.text(`Page ${i} / ${pages}`,285,202,{align:'right'});
}doc.save('edge-journal-report-'+now.toISOString().slice(0,10)+'.pdf');
toast('PDF report generated.');
}
$('journalPdfBtn').addEventListener('click',exportJournalPDF);
$('todayDate').textContent=new Date().toLocaleDateString('id-ID',{weekday:'short',month:'short',day:'2-digit',year:'numeric'});
$('reviewDate').value=new Date().toISOString().slice(0,10);
renderAll();
const savedGitHubConfig=getGitHubConfig();
if(savedGitHubConfig?.token&&savedGitHubConfig?.owner&&savedGitHubConfig?.dataRepo){syncJournalFromGitHub({quiet:true});
if(savedGitHubConfig.pagesUrl)$('githubBtn').innerHTML='⚙ Pengaturan GitHub <span>↗</span>';
 $('githubOpenBtn').innerHTML='◉ Buka Repository <span>↗</span>';
}
