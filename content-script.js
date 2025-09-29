// content-script.js — Injects hooks into page to capture fetch, XHR, document.cookie, and localStorage events

(function(){

    /**
     * Injects a script into the page context.
     * @param {string} code JavaScript code to inject
     */
    function injectScript(code){
        const script = document.createElement('script');
        script.textContent = code;
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
    }

    /**
     * Code injected into page context to hook network and storage APIs.
     */
    const pageHook = `
    (function() {
        /**
         * Helper to post captured data to content script.
         * @param {object} obj
         */
        function sendToContentScript(obj){
            window.postMessage({ __api_mapper: true, payload: obj }, "*");
        }

        // --- Wrap fetch API ---
        const originalFetch = window.fetch;
        window.fetch = function(input, init){
            try {
                const url = (typeof input === 'string') ? input : (input && input.url) || '';
                sendToContentScript({ type: 'fetch', url: url, method: (init && init.method) || 'GET', body: init && init.body });
            } catch(e){}
            return originalFetch.apply(this, arguments);
        };

        // --- Wrap XMLHttpRequest ---
        (function(){
            const XProto = XMLHttpRequest.prototype;
            const originalOpen = XProto.open;
            const originalSend = XProto.send;

            XProto.open = function(method, url){
                this.__api_mapper_method = method;
                this.__api_mapper_url = url;
                return originalOpen.apply(this, arguments);
            };

            XProto.send = function(body){
                try {
                    sendToContentScript({
                        type: 'xhr',
                        url: this.__api_mapper_url,
                        method: this.__api_mapper_method,
                        body: body
                    });
                } catch(e){}
                return originalSend.apply(this, arguments);
            };
        })();

        // --- Intercept document.cookie writes ---
        try {
            const docProto = Document.prototype;
            const desc = Object.getOwnPropertyDescriptor(docProto, 'cookie') ||
                         Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

            if (desc && desc.configurable){
                const nativeGet = desc.get;
                const nativeSet = desc.set;

                Object.defineProperty(document, 'cookie', {
                    configurable: true,
                    enumerable: true,
                    get: function(){ return nativeGet.call(document); },
                    set: function(value){
                        try { sendToContentScript({ type: 'cookie-set-script', value: String(value) }); } catch(e){}
                        return nativeSet.call(document, value);
                    }
                });
            } else {
                // fallback if descriptor not configurable
                document.__defineSetter__('cookie', function(value){
                    try { sendToContentScript({ type: 'cookie-set-script', value: String(value) }); } catch(e){}
                    HTMLDocument.prototype.__lookupSetter__('cookie') &&
                        HTMLDocument.prototype.__lookupSetter__('cookie').call(document, value);
                });
            }
        } catch(e) {}

        // --- Intercept localStorage operations ---
        (function() {
            const originalSetItem = localStorage.setItem;
            const originalRemoveItem = localStorage.removeItem;

            localStorage.setItem = function(key, value) {
                try {
                    sendToContentScript({ type: 'local-storage', action: 'setItem', key: key, value: value });
                } catch(e){}
                return originalSetItem.apply(this, arguments);
            };

            localStorage.removeItem = function(key) {
                try {
                    sendToContentScript({ type: 'local-storage', action: 'removeItem', key: key });
                } catch(e){}
                return originalRemoveItem.apply(this, arguments);
            };
        })();

    })();
    `;

    injectScript(pageHook);

    // --- Extra security monitoring ---
    const pageHookExtra = `
        (function() {
        function send(obj){ window.postMessage({ __api_mapper: true, payload: obj }, "*"); }

        // Canvas fingerprint detection
        const HTMLCanvasProto = HTMLCanvasElement.prototype;
        ['toDataURL','toBlob'].forEach(fnName => {
            const nativeFn = HTMLCanvasProto[fnName];
            if(nativeFn){
            HTMLCanvasProto[fnName] = function(){
                try { send({ type:'canvas-fingerprint', method:fnName, width:this.width, height:this.height }); } catch(e){}
                return nativeFn.apply(this, arguments);
            };
            }
        });

        // Suspicious hook / hijack detection
        const sensitiveAPIs = [
            {obj:window,name:'alert'}, {obj:window,name:'confirm'}, {obj:window,name:'prompt'},
            {obj:window.history,name:'pushState'}, {obj:window.history,name:'replaceState'},
            {obj:Document.prototype,name:'write'}, {obj:Document.prototype,name:'writeln'}
        ];
        sensitiveAPIs.forEach(api=>{
            const original = api.obj[api.name];
            if(original){
            Object.defineProperty(api.obj, api.name, {
                configurable:true, enumerable:true, writable:true,
                value:function(){
                try { send({ type:'suspicious-hook', api:api.name, args:Array.from(arguments) }); } catch(e){}
                return original.apply(this, arguments);
                }
            });
            }
        });
        })();
    `;
    inject(pageHookExtra);

    // --- Listen for messages from page context and forward to background ---
    window.addEventListener('message', function(event){
        if (!event.data || !event.data.__api_mapper) return;
        try {
            browser.runtime.sendMessage({ __api_mapper: true, payload: event.data.payload });
        } catch(e){
            // fallback to chrome namespace if browser not available
            try { chrome.runtime.sendMessage({ __api_mapper: true, payload: event.data.payload }); } catch(e){}
        }
    }, false);

})();
