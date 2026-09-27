(function(){
"use strict";
function callAction(raw,event){
 raw=(raw||"").trim(); var m;
 try{
  if((m=raw.match(/^show\(['"]([^'"]+)['"]\)$/))){
   var id=m[1]; document.querySelectorAll(".section").forEach(function(x){x.classList.remove("active")});
   var s=document.getElementById(id); if(s)s.classList.add("active");
   var loaders={home:"loadFeed",profile:"loadProfile",friends:"loadFriends",requests:"loadRequests",notifications:"loadNotifications",saved:"loadSaved",stories:"loadStories",marketplace:"loadMarketplace",groups:"loadGroups",pages:"loadPages",events:"loadEvents",blogger:"loadBloggerPosts"};
   if(loaders[id]&&typeof window[loaders[id]]==="function")window[loaders[id]]();
   return true;
  }
  if((m=raw.match(/^location\.href=['"]([^'"]+)['"]$/))){window.location.href=m[1];return true}
  if((m=raw.match(/^([A-Za-z_$][\w$]*)\(\)$/))&&typeof window[m[1]]==="function"){window[m[1]]();return true}
  if((m=raw.match(/^([A-Za-z_$][\w$]*)\(event\)$/))&&typeof window[m[1]]==="function"){window[m[1]](event);return true}
  if((m=raw.match(/^([A-Za-z_$][\w$]*)\(['"]([^'"]*)['"]\)$/))&&typeof window[m[1]]==="function"){window[m[1]](m[2]);return true}
 }catch(e){console.error("SocialHub click",e)}
 return false;
}
function route(e){
 var el=e.target&&e.target.closest?e.target.closest("#site [onclick],#site [data-socialhub-action]"):null;
 if(!el)return;
 var raw=el.getAttribute("data-socialhub-action")||el.getAttribute("onclick")||"";
 if(raw&&callAction(raw,e)){e.preventDefault();e.stopImmediatePropagation()}
}
document.addEventListener("click",route,true);
window.socialHubRouteClick=callAction;
})();