(function(){
  var w=document.querySelector('.wrap'); if(!w)return;
  var ico=document.body.getAttribute('data-icon')||'🎮', home=/index\.html$|\/$/.test(location.pathname);
  var t=document.createElement('div'); t.className='w98-title';
  t.innerHTML='<span class="ti">'+ico+'</span><span class="tt">'+document.title+'</span>'+
    '<span class="tb">_</span><span class="tb">□</span>'+(home?'<span class="tb x">×</span>':'<a class="tb x" href="index.html" title="Cerrar">×</a>');
  w.insertBefore(t,w.firstChild);
  document.querySelectorAll('.modal h2').forEach(function(h){h.innerHTML=h.textContent;});
})();
