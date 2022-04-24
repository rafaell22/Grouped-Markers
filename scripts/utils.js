function loadGoogleMapsLibrary(apiKey) {
    return new Promise(function (resolve, reject){
      const url = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=initMap`;
      const newScript = document.createElement('script');
      newScript.type = 'text/javascript';
      newScript.async = 1;

      if (newScript.readyState) {  // IE
        newScript.onreadystatechange = function() {
          if (newScript.readyState === 'loaded' || newScript.readyState === 'complete') {
            newScript.onreadystatechange = null;
            resolve();
          }
        };
      } else {  // Non-IE
        newScript.onerror = function(errorLoadingScript) {
          // console.log(errorLoadingLink);
          reject('The script' + errorLoadingScript.target.src + ' didn\'t load correctly.');
        }
        newScript.onload = function(){
          resolve();
        };
      }

      newScript.src = url;
      document.head.appendChild(newScript);
    });
  };

export {
  loadGoogleMapsLibrary,
};