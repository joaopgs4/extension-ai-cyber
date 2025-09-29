document.getElementById('refresh').addEventListener('click', load);
document.getElementById('addLink').addEventListener('click', addLink);

function load() {
  browser.runtime.sendMessage({ action: 'getState' }).then(data => {
    renderTree(data);
    loadBlockedList();
  });
}

function renderTree(data) {
  const tree = document.getElementById('tree');
  tree.innerHTML = '';

  function createNode(key, value) {
    const li = document.createElement('li');

    if (typeof value === 'object' && value !== null) {
      const span = document.createElement('span');
      const arrow = document.createElement('span');
      arrow.textContent = '>'; // collapsed by default
      arrow.style.color = '#555';
      arrow.style.marginRight = '4px';
      span.appendChild(arrow);

      const textNode = document.createElement('span');
      textNode.textContent = key + ': ' + (Array.isArray(value) ? '[ ]' : '{ }');
      textNode.style.color = '#1a0dab';
      span.appendChild(textNode);

      span.addEventListener('click', e => {
        e.stopPropagation();
        const ul = li.querySelector('ul');
        if (ul) {
          const visible = ul.style.display !== 'none';
          ul.style.display = visible ? 'none' : 'block';
          arrow.textContent = visible ? '>' : '⌄';
        }
      });

      li.appendChild(span);

      const ul = document.createElement('ul');
      ul.style.marginLeft = '15px';
      ul.style.display = 'none'; // start collapsed
      for (const k in value) ul.appendChild(createNode(k, value[k]));
      li.appendChild(ul);
    } else {
      const spanKey = document.createElement('span');
      spanKey.textContent = key + ': ';
      spanKey.style.color = '#333';

      const spanVal = document.createElement('span');
      spanVal.textContent = value;
      if (typeof value === 'number') spanVal.style.color = 'green';
      else if (typeof value === 'boolean') spanVal.style.color = 'red';
      else spanVal.style.color = '#555';

      li.appendChild(spanKey);
      li.appendChild(spanVal);
    }
    return li;
  }

  const ul = document.createElement('ul');
  for (const k in data) ul.appendChild(createNode(k, data[k]));
  tree.appendChild(ul);
}

// Adding new blocked link
function addLink() {
  const url = document.getElementById('newLink').value.trim();
  if (!url) return alert('Enter a URL');
  browser.runtime.sendMessage({ action: 'addManualBlockedUrl', url }).then(() => {
    document.getElementById('newLink').value = '';
    loadBlockedList();
  });
}

// Display manual blocked list with remove buttons
function loadBlockedList() {
  if (!document.getElementById('manualListContainer')) {
    const container = document.createElement('div');
    container.id = 'manualListContainer';
    container.style.marginTop = '10px';
    container.innerHTML = '<b>Manually blocked URLs:</b><br>';
    document.body.appendChild(container);
  }
  const container = document.getElementById('manualListContainer');
  container.innerHTML = '<b>Manually blocked URLs:</b><br>';

  browser.runtime.sendMessage({ action: 'getManualBlockedUrls' }).then(list => {
    list.forEach(url => {
      const div = document.createElement('div');
      div.style.margin = '2px 0';
      div.style.display = 'flex';
      div.style.alignItems = 'center';

      const span = document.createElement('span');
      span.textContent = url;
      span.style.flex = '1';
      span.style.wordBreak = 'break-all';

      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.style.marginLeft = '5px';
      btn.addEventListener('click', () => {
        browser.runtime.sendMessage({ action: 'removeManualBlockedUrl', url }).then(load);
      });

      div.appendChild(span);
      div.appendChild(btn);
      container.appendChild(div);
    });
  });
}

load();
