/* Push only: no authenticated pages, API responses or conversation history are cached. */
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json() || {};}catch{/* Generic notification. */}
  const url=typeof data.url==='string' && /^\/w\/[a-z\d-]+\/c\/[\w%=-]+$/i.test(data.url)?data.url:'/login';
  event.waitUntil(self.registration.showNotification('Gitrew',{body:'New activity in a conversation you follow.',icon:'/brand/gitrew-mark.png',tag:url,data:{url}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const destination=new URL(event.notification.data?.url || '/login',self.location.origin);
  if(destination.origin!==self.location.origin)return;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    const existing=windows.find(w=>new URL(w.url).origin===self.location.origin);
    if(existing){await existing.navigate(destination.href);await existing.focus();}else await clients.openWindow(destination.href);
  }));
});
