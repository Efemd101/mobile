/**
 * Utility functions for working with the WebView
 */

/**
 * Generate JavaScript to inject into the WebView to extract the token
 * @returns {string} JavaScript to inject
 */
export const getTokenExtractionScript = () => {
  return `
    (function() {
      // Console interceptors to capture logs
      const originalConsole = window.console;
      window.console = {
        log: function(...args) {
          originalConsole.log(...args);
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'console.log', 
              data: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
            }));
          } catch (e) {
            originalConsole.error('Error posting log message', e);
          }
        },
        error: function(...args) {
          originalConsole.error(...args);
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'console.error', 
              data: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
            }));
          } catch (e) {
            originalConsole.error('Error posting error message', e);
          }
        },
        warn: function(...args) {
          originalConsole.warn(...args);
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'console.warn', 
              data: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
            }));
          } catch (e) {
            originalConsole.error('Error posting warn message', e);
          }
        },
        info: function(...args) {
          originalConsole.info(...args);
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'console.info', 
              data: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')
            }));
          } catch (e) {
            originalConsole.error('Error posting info message', e);
          }
        }
      };

      // Track fetch and XMLHttpRequest for login errors
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = args[0];
        const options = args[1] || {};
        
        console.log('Fetch request to: ' + url);
        
        try {
          const response = await originalFetch(...args);
          
          // Clone the response so we can read the body
          const clonedResponse = response.clone();
          
          // For login-related endpoints, capture any errors
          if (url.includes('login') || url.includes('auth')) {
            try {
              const data = await clonedResponse.json();
              console.log('Login response:', JSON.stringify(data));
              
              if (!response.ok) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ 
                  type: 'login.error', 
                  data: {
                    status: response.status,
                    url: url,
                    response: data
                  }
                }));
              }
            } catch (e) {
              console.error('Error parsing login response', e);
            }
          }
          
          return response;
        } catch (error) {
          console.error('Fetch error for ' + url + ': ' + error.message);
          
          if (url.includes('login') || url.includes('auth')) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'login.error', 
              data: {
                url: url,
                error: error.message
              }
            }));
          }
          
          throw error;
        }
      };
      
      // Monitor XHR requests
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        const originalSend = xhr.send;
        
        let requestMethod;
        let requestUrl;
        
        xhr.open = function(method, url) {
          requestMethod = method;
          requestUrl = url;
          console.log('XHR Request: ' + method + ' ' + url);
          return originalOpen.apply(this, arguments);
        };
        
        xhr.send = function(body) {
          if (requestUrl.includes('login') || requestUrl.includes('auth')) {
            console.log('Login request body:', body ? body : 'Empty body');
          }
          
          xhr.addEventListener('load', function() {
            if (requestUrl.includes('login') || requestUrl.includes('auth')) {
              try {
                const responseText = xhr.responseText;
                console.log('Login XHR Response: ' + xhr.status + ' ' + responseText);
                
                if (xhr.status >= 400) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ 
                    type: 'login.error', 
                    data: {
                      status: xhr.status,
                      url: requestUrl,
                      response: responseText
                    }
                  }));
                }
              } catch (e) {
                console.error('Error parsing XHR response', e);
              }
            }
          });
          
          xhr.addEventListener('error', function() {
            console.error('XHR Error for ' + requestUrl);
            
            if (requestUrl.includes('login') || requestUrl.includes('auth')) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'login.error', 
                data: {
                  url: requestUrl,
                  error: 'Network error'
                }
              }));
            }
          });
          
          return originalSend.apply(this, arguments);
        };
        
        return xhr;
      };

      // Functions to check for token
      function checkToken() {
        const token = localStorage.getItem('token');
        if (token) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token', value: token }));
        } else {
          setTimeout(checkToken, 1000); // Check again in 1 second
        }
      }
      
      // Start checking for token
      checkToken();
      
      // Also listen for changes to localStorage
      window.addEventListener('storage', function(e) {
        if (e.key === 'token') {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token', value: e.newValue }));
        }
      });

      // Catch global errors
      window.addEventListener('error', function(event) {
        console.error('JavaScript error: ' + event.message + ' at ' + event.filename + ':' + event.lineno);
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'global.error', 
          data: {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error ? event.error.toString() : null
          }
        }));
      });

      // Add global functions for navigation from notification
      window.navigateToConversation = function(conversationId) {
        console.log('Navigating to conversation:', conversationId);
        
        try {
          // This depends on your frontend routing implementation
          // For example with react-router:
          if (window.location.pathname !== '/chat') {
            window.location.href = '/chat?conversationId=' + conversationId;
          } else {
            // If we're already on the chat page, use any available methods to switch conversations
            if (typeof window.openConversation === 'function') {
              window.openConversation(conversationId);
            }
          }
          return true;
        } catch (error) {
          console.error('Error navigating to conversation:', error);
          return false;
        }
      };

      true;
    })();
  `;
};

/**
 * Get a script to navigate to a specific page in the WebView
 * @param {string} route The route to navigate to
 * @returns {string} JavaScript to execute in the WebView
 */
export const getNavigationScript = (route) => {
  return `
    (function() {
      try {
        console.log('Navigating to: ${route}');
        
        // Handle different route formats
        let targetRoute = '${route}';
        
        // If it doesn't start with /, add it
        if (!targetRoute.startsWith('/')) {
          targetRoute = '/' + targetRoute;
        }
        
        // Handle conversation routes properly
        if (targetRoute.includes('/chat/')) {
          const conversationId = targetRoute.split('/chat/')[1];
          // Check if there's an existing navigation function
          if (window.navigateToConversation && typeof window.navigateToConversation === 'function') {
            window.navigateToConversation(conversationId);
            return;
          }
        }
        
        // For other routes or fallback
        if (window.history && window.history.pushState) {
          window.history.pushState({}, '', targetRoute);
          
          // Trigger a navigation event for React Router or similar
          const navEvent = new PopStateEvent('popstate');
          window.dispatchEvent(navEvent);
          
          // Alternative: dispatch a custom event for the app to handle
          const customEvent = new CustomEvent('navigation', { detail: { route: targetRoute } });
          window.dispatchEvent(customEvent);
        } else {
          // Simple fallback
          window.location.href = targetRoute;
        }
      } catch (e) {
        console.error('Navigation error:', e);
      }
    })();
    true;
  `;
};

/**
 * Parse a message received from the WebView
 * @param {Object} event Event object from WebView
 * @returns {Object|null} Parsed message or null if parsing failed
 */
export const parseWebViewMessage = (event) => {
  try {
    return JSON.parse(event.nativeEvent.data);
  } catch (error) {
    console.error('Error parsing WebView message:', error);
    return null;
  }
};

/**
 * Get the WebSocket URL
 * @param {string} token Authentication token
 * @param {string} baseUrl Base WebSocket URL
 * @returns {string} Complete WebSocket URL with token
 */
export const getWebSocketUrl = (token, baseUrl = 'wss://zylo.vet') => {
  // Ensure the baseUrl uses ws:// protocol
  const wsBaseUrl = baseUrl.replace(/^http:\/\//, 'ws://');
  return `${wsBaseUrl}?token=${token}`;
};

/**
 * Add extra debugging for login XHR and fetch errors
 * @returns {string} JavaScript to inject
 */
export const getLoginDebugScript = () => {
  return `
    (function() {
      console.log('Injecting additional login debug script');
      
      // More detailed fetch tracking specifically for login
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = args[0];
        const options = args[1] || {};
        
        // Only for login
        if (url.includes('login') || url.includes('auth')) {
          console.log('LOGIN DEBUG: Fetch request to: ' + url, JSON.stringify(options));
          try {
            console.log('LOGIN DEBUG: Network connection check...');
            
            // Try to fetch a small resource to test connectivity
            const testFetch = await originalFetch('wss://zylo.vet/ping', { 
              method: 'GET',
              mode: 'no-cors'
            });
            console.log('LOGIN DEBUG: Network connection OK');
            
            // Now try original login request
            const response = await originalFetch(...args);
            console.log('LOGIN DEBUG: Response received:', response.status);
            return response;
          } catch (error) {
            console.error('LOGIN DEBUG: Network error details:', error.toString());
            throw error;
          }
        }
        
        return originalFetch(...args);
      };
      
      console.log('Login debug script injection complete');
      true;
    })();
  `;
}; 