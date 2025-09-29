// popup.js — Handles UI interactions for extension popup: viewing requests and managing manual blocks

// --- Event Listeners ---
document.getElementById('refresh').addEventListener('click', refreshState);
document.getElementById('addLink').addEventListener('click', addManualBlockedUrl);

/**
 * Refreshes extension state: fetches current state and blocked list.
 */
function refreshState() {
    browser.runtime.sendMessage({ action: 'getState' }).then(data => {
        renderStateTree(data);
        displayManualBlockedList();
    });
}

/**
 * Renders a collapsible tree view of extension state.
 * @param {object} data - State data from background script
 */
function renderStateTree(data) {
    const treeContainer = document.getElementById('tree');
    treeContainer.innerHTML = '';

    /**
     * Recursively creates tree nodes for objects and arrays
     * @param {string} key
     * @param {any} value
     * @returns {HTMLElement}
     */
    function createTreeNode(key, value) {
        const li = document.createElement('li');

        if (typeof value === 'object' && value !== null) {
            const span = document.createElement('span');

            // Collapsible arrow
            const arrow = document.createElement('span');
            arrow.textContent = '>'; // collapsed
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
            for (const k in value) ul.appendChild(createTreeNode(k, value[k]));
            li.appendChild(ul);

        } else {
            // Leaf node
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

    const ulRoot = document.createElement('ul');
    for (const k in data) ulRoot.appendChild(createTreeNode(k, data[k]));
    treeContainer.appendChild(ulRoot);
}

/**
 * Adds a new manual blocked URL entered by the user.
 */
function addManualBlockedUrl() {
    const urlInput = document.getElementById('newLink').value.trim();
    if (!urlInput) return alert('Enter a URL');

    browser.runtime.sendMessage({ action: 'addManualBlockedUrl', url: urlInput }).then(() => {
        document.getElementById('newLink').value = '';
        displayManualBlockedList();
    });
}

/**
 * Displays the list of manually blocked URLs with remove buttons.
 */
function displayManualBlockedList() {
    let container = document.getElementById('manualListContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'manualListContainer';
        container.style.marginTop = '10px';
        container.innerHTML = '<b>Manually blocked URLs:</b><br>';
        document.body.appendChild(container);
    }
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

            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.style.marginLeft = '5px';
            removeBtn.addEventListener('click', () => {
                browser.runtime.sendMessage({ action: 'removeManualBlockedUrl', url }).then(refreshState);
            });

            div.appendChild(span);
            div.appendChild(removeBtn);
            container.appendChild(div);
        });
    });
}

// Initial load
refreshState();
