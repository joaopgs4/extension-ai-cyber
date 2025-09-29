// content-script runs in extension isolated world.
// Inject a script into page context to intercept fetch/XHR/document.cookie.
(function(){
  function inject(src){
    const s = document.createElement('script');
    s.textContent = src;
    (document.documentElement || document.head || document.body).appendChild(s);
    s.remove();
  }

  const pageHook = `
    (function() {
      // helper to post to content script
      function send(obj){ window.postMessage({ __api_mapper: true, payload: obj }, "*"); }

      // wrap fetch
      const _fetch = window.fetch;
      window.fetch = function(input, init){
        try {
          const url = (typeof input === 'string') ? input : (input && input.url) || '';
          send({ type: 'fetch', url: url, method: (init && init.method) || 'GET', body: init && init.body });
        } catch(e){}
        return _fetch.apply(this, arguments);
      };

      // wrap XHR
      (function(){
        const XProto = XMLHttpRequest.prototype;
        const _open = XProto.open;
        const _send = XProto.send;
        XProto.open = function(method, url){
          this.__api_mapper_method = method;
          this.__api_mapper_url = url;
          return _open.apply(this, arguments);
        };
        XProto.send = function(body){
          try {
            window.postMessage({ __api_mapper: true, payload: { type: 'xhr', url: this.__api_mapper_url, method: this.__api_mapper_method, body: body } }, "*");
          } catch(e){}
          return _send.apply(this, arguments);
        };
      })();

      // intercept document.cookie writes
      try {
        const docProto = Document.prototype;
        const desc = Object.getOwnPropertyDescriptor(docProto, 'cookie') || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
        if (desc && desc.configurable) {
          const nativeGet = desc.get;
          const nativeSet = desc.set;
          Object.defineProperty(document, 'cookie', {
            configurable: true,
            enumerable: true,
            get: function(){ return nativeGet.call(document); },
            set: function(val){
              try { window.postMessage({ __api_mapper: true, payload: { type: 'cookie-set-script', value: String(val) } }, "*"); } catch(e){}
              return nativeSet.call(document, val);
            }
          });
        } else {
          // fallback: override on document
          document.__defineSetter__('cookie', function(val){
            try { window.postMessage({ __api_mapper: true, payload: { type: 'cookie-set-script', value: String(val) } }, "*"); } catch(e){}
            // cannot call native setter here; best-effort
            HTMLDocument.prototype.__lookupSetter__('cookie') && HTMLDocument.prototype.__lookupSetter__('cookie').call(document, val);
          });
        }
      } catch(e) {}
    })();

    // intercept localStorage setItem/removeItem
    (function() {
    const _setItem = localStorage.setItem;
    const _removeItem = localStorage.removeItem;
    localStorage.setItem = function(k, v) {
        try {
        window.postMessage({ __api_mapper: true, payload: { type: 'local-storage', action: 'setItem', key: k, value: v } }, "*");
        } catch(e){}
        return _setItem.apply(this, arguments);
    };
    localStorage.removeItem = function(k) {
        try {
        window.postMessage({ __api_mapper: true, payload: { type: 'local-storage', action: 'removeItem', key: k } }, "*");
        } catch(e){}
        return _removeItem.apply(this, arguments);
    };
    })();
  `;
  inject(pageHook);

  // listen to page messages and forward to background
  window.addEventListener('message', function(event){
    if (!event.data || !event.data.__api_mapper) return;
    try {
      browser.runtime.sendMessage({ __api_mapper: true, payload: event.data.payload });
    } catch(e){
      // `browser` may not be available in content script in some contexts; use chrome fallback
      try { chrome.runtime.sendMessage({ __api_mapper: true, payload: event.data.payload }); } catch(e){}
    }
  }, false);
})();
