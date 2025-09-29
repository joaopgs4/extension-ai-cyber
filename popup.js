document.getElementById('refresh').addEventListener('click', load);
document.getElementById('export').addEventListener('click', exportJSON);
load();

function load(){
  browser.runtime.sendMessage({ action: "getState" }).then(data => {
    render(data);
  }).catch(err => {
    document.getElementById('dump').textContent = 'Error: ' + err;
  });
}

function render(data){
  const s = data.summary;
  document.getElementById('summary').innerText =
    'requests: ' + s.totalRequests +
    '   third-party: ' + s.thirdPartyRequests +
    '   set-cookie headers: ' + s.totalSetCookieFromResponses;
  document.getElementById('dump').textContent = JSON.stringify(data, null, 2);
}

function exportJSON(){
  browser.runtime.sendMessage({ action: "getState" }).then(data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api_cookie_map.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}
