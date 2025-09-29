// background.js — tab-based output + EasyList blocking

const state = {
  requests: [],          // {id, url, method, tabId, initiator, thirdParty, time, statusCode, setCookieCount, dangerous, blocked}
  cookies: [],
  pageMessages: []
};

let easyListRules = [];
let easyListRaw = '';
const EASYLIST_URL = 'https://easylist.to/easylist/easylist.txt';
const EASYLIST_REFRESH_MS = 1000 * 60 * 60 * 6;

function domainOf(u){ try { return new URL(u).hostname; } catch(e){ return null; } }
async function isThirdParty(requestUrl, tabId){
  if (!tabId || tabId < 0) return true;
  try { const tab = await browser.tabs.get(tabId); return new URL(tab.url).hostname !== new URL(requestUrl).hostname; } catch(e){ return true; }
}

// EasyList loader & parser (subset)
function escapeRegex(s){ return s.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&'); }
function ruleToRegex(rule){
  rule = rule.trim(); if (!rule || rule.startsWith('!') || rule.startsWith('@@') || rule.includes('##') || rule.includes('#@#')) return null;
  let anchoredStart=false, anchoredEnd=false;
  if (rule.startsWith('|')) { anchoredStart=true; rule=rule.replace(/^\|/, ''); }
  if (rule.endsWith('|')) { anchoredEnd=true; rule=rule.slice(0,-1); }
  let prefixRegex = '';
  if (rule.startsWith('||')) { rule=rule.slice(2); prefixRegex='^(?:[a-z0-9+-]+:)?(?://)?(?:[^/]*\\.)?'; }
  let regexStr=''; for(let i=0;i<rule.length;i++){ const ch=rule[i]; if(ch==='*'){regexStr+='.*'; continue;} if(ch==='^'){regexStr+='[^A-Za-z0-9_\\-.%]'; continue;} regexStr+=escapeRegex(ch); }
  if(prefixRegex) regexStr=prefixRegex+regexStr; if(anchoredStart) regexStr='^'+regexStr; if(anchoredEnd) regexStr+= '$';
  try { return new RegExp(regexStr); } catch(e){ return null; }
}

async function fetchEasyList(){
  try {
    const resp=await fetch(EASYLIST_URL); if(!resp.ok)throw new Error('EasyList fetch failed '+resp.status);
    const text=await resp.text(); if(text===easyListRaw)return; easyListRaw=text;
    const lines=text.split(/\r?\n/); easyListRules=[]; for(const L of lines){ const r=ruleToRegex(L); if(r) easyListRules.push(r); }
    console.log('EasyList loaded. Rules:', easyListRules.length);
  } catch(e){ console.warn('Failed to load EasyList:',e); }
}
fetchEasyList(); setInterval(fetchEasyList,EASYLIST_REFRESH_MS);

function matchesEasyList(url){ if(!easyListRules||easyListRules.length===0)return false; try{ for(const re of easyListRules) if(re.test(url)) return true; } catch(e){} return false; }

// Requests
browser.webRequest.onBeforeRequest.addListener(
  details => {
    const now=Date.now();
    const req={id:details.requestId,url:details.url,method:details.method,tabId:details.tabId,initiator:details.initiator||details.originUrl||null,time:now,statusCode:null,setCookieCount:0,thirdParty:null,dangerous:false,blocked:false};
    const isDangerous=matchesEasyList(details.url);
    if(isDangerous){ req.dangerous=true; req.blocked=true; }
    state.requests.push(req);
    isThirdParty(details.url,details.tabId).then(tp=>{ const r=state.requests.find(x=>x.id===details.requestId); if(r) r.thirdParty=tp; }).catch(()=>{});
    if(isDangerous) return { cancel:true }; return {};
  },
  { urls:["<all_urls>"] },
  ["blocking"]
);

browser.webRequest.onCompleted.addListener(
  details=>{
    const r=state.requests.find(x=>x.id===details.requestId);
    if(r){ r.statusCode=details.statusCode;
      if(details.responseHeaders){ const sc=details.responseHeaders.filter(h=>h.name.toLowerCase()==='set-cookie').length; r.setCookieCount=sc;
        if(sc>0) state.cookies.push({time:Date.now(),removed:false,cause:"set-cookie-header",cookie:`from-response to ${details.url} (${sc})`,source:"response",requestId:details.requestId,tabId:details.tabId}); }
    }
  },
  { urls:["<all_urls>"] },
  ["responseHeaders"]
);

browser.cookies.onChanged.addListener(change=>{
  state.cookies.push({time:Date.now(),removed:change.removed,cause:change.cause,cookie:{name:change.cookie.name,domain:change.cookie.domain,path:change.cookie.path,storeId:change.cookie.storeId,secure:change.cookie.secure,httpOnly:change.cookie.httpOnly,sameSite:change.cookie.sameSite},source:"browser-cookie-api"});
});

// messages from content script
browser.runtime.onMessage.addListener((msg,sender)=>{
  if(msg && msg.__api_mapper){
    const payload=msg.payload; payload.tabId=sender.tab?sender.tab.id:null; payload.time=Date.now();
    state.pageMessages.push(payload);
    if(payload.type==='cookie-set-script'){ state.cookies.push({time:Date.now(),removed:false,cause:"document.cookie",cookie:payload.value,source:"script",tabId:payload.tabId}); }
  }
});

// getState: produce tab-based JSON
browser.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg && msg.action==='getState'){
    const requests=state.requests.slice();
    const cookies=state.cookies.slice();
    const pageMessages=state.pageMessages.slice();

    const totalRequests=requests.length;
    const thirdPartyRequests=requests.filter(r=>r.thirdParty===true).length;
    const totalSetCookieFromResponses=requests.reduce((acc,r)=>acc+(r.setCookieCount||0),0);
    const dangerousRequests=requests.filter(r=>r.dangerous).length;
    const blockedRequests=requests.filter(r=>r.blocked).length;
    const cookieSourceCounts=cookies.reduce((acc,c)=>{ acc[c.source]=(acc[c.source]||0)+1; return acc; },{});

    // organize per-tab
    const tabs = {};
    for(const r of requests){
      const t=r.tabId||0;
      if(!tabs[t]) tabs[t]={firstParty:[],thirdParty:[],localStorage:[]};
      if(r.thirdParty) tabs[t].thirdParty.push(r);
      else tabs[t].firstParty.push(r);
    }
    for(const m of pageMessages.filter(m=>m.type==='local-storage')){
      const t=m.tabId||0;
      if(!tabs[t]) tabs[t]={firstParty:[],thirdParty:[],localStorage:[]};
      tabs[t].localStorage.push(m);
    }

    sendResponse({
      summary:{
        totalRequests,
        thirdPartyRequests,
        totalSetCookieFromResponses,
        cookieSourceCounts,
        dangerousRequests,
        blockedRequests
      },
      tabs
    });
  }
  return true;
});
