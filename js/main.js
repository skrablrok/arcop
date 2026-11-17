/* ARCOP · page behaviour: header, headline animation, "Kako poteka" scroll scene, statement, FAQ, form */
(function(){
/* image slots: if a photo file is not there yet, remove the broken image so the grey box shows */
[].forEach.call(document.querySelectorAll('.ph img'),function(img){
  function drop(){img.remove()}
  if(img.complete&&img.naturalWidth===0)drop();else img.addEventListener('error',drop);
});

var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var root=document.documentElement;
if(rm)root.classList.add('rm');
document.getElementById('yr').textContent=new Date().getFullYear();
/* split hero headline into letters for the intro */
(function(){var n=0;[].slice.call(document.querySelectorAll('.hero h1 .ln>span')).forEach(function(line){
  [].slice.call(line.childNodes).forEach(function(c){
    if(c.nodeType!==3)return;var f=document.createDocumentFragment();
    c.textContent.split(/(\s+)/).forEach(function(w){if(!w)return;if(/^\s+$/.test(w)){f.appendChild(document.createTextNode(' '));return}
      var wd=document.createElement('span');wd.className='wd';
      for(var i=0;i<w.length;i++){var ch=document.createElement('span');ch.className='ch';ch.textContent=w[i];ch.style.setProperty('--d',(.15+n++*.035).toFixed(3)+'s');wd.appendChild(ch)}
      if(w==='objekte')wd.classList.add('hl');
      f.appendChild(wd)});
    c.replaceWith(f)})});
  var dot=document.querySelector('.hero h1 .dot');if(dot)dot.style.setProperty('--d',(.25+n*.035)+'s')})();
/* hero headline fills the width on desktop */
var h1=document.querySelector('.hero h1'),l1=h1.querySelector('.ln>span');
function fit(){h1.style.fontSize='';if(innerWidth<=600)return;
  l1.style.display='inline-block';var w=l1.getBoundingClientRect().width,avail=h1.parentElement.clientWidth-parseFloat(getComputedStyle(h1.parentElement).paddingLeft)*2;
  l1.style.display='';var fs=parseFloat(getComputedStyle(h1).fontSize);if(w>0)h1.style.fontSize=Math.min(fs*avail/w*.985,260)+'px'}
fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);addEventListener('resize',fit);
/* the text animation starts when the drone has washed the black screen (js/drone.js calls __introDone) */
var veil=document.getElementById('veil'),wentGo=false;
window.__introDone=function(){if(wentGo)return;wentGo=true;root.classList.remove('lock');
  if(veil){veil.classList.add('out');setTimeout(function(){veil.remove()},600)}
  requestAnimationFrame(function(){setTimeout(function(){root.classList.add('go')},60)})};
try{history.scrollRestoration='manual'}catch(e){}if(!location.hash)scrollTo(0,0);
if(rm||!veil||scrollY>40){window.__introDone()}
else{root.classList.add('lock');
  var vc=veil.getContext('2d'),dpr=Math.min(2,devicePixelRatio||1);veil.width=innerWidth*dpr;veil.height=innerHeight*dpr;
  vc.scale(dpr,dpr);vc.fillStyle='#0e0e0d';vc.fillRect(0,0,innerWidth,innerHeight);
  setTimeout(function(){if(!window.__introStarted)window.__introDone()},4000)}
root.classList.remove('pre');
function clamp(v){return v<0?0:v>1?1:v}


/* header */
var hd=document.getElementById('hd');
function hdr(){hd.classList.toggle('on',scrollY>20)}

/* ruler ticks: 0–60 m */
var MAXM=60,ticks=document.getElementById('ticks');
for(var m=0;m<=MAXM;m+=5){var t=document.createElement('div');t.className='t'+(m%10?'':' big');t.style.bottom=(m/MAXM*100)+'%';
  if(m%10===0){var s=document.createElement('span');s.textContent=m+' m';t.appendChild(s)}ticks.appendChild(t)}

/* altitude chapters */
var climb=document.getElementById('dron'),arts=[].slice.call(climb.querySelectorAll('.chap article')),
    mk=document.getElementById('mk'),alt=document.getElementById('alt'),rulerEl=climb.querySelector('.ruler');
var cur=0,smooth=0;
function climbRun(){
  var r=climb.getBoundingClientRect(),len=Math.max(1,climb.offsetHeight-innerHeight);
  var p=clamp(-r.top/len);
  smooth+= (p-smooth)*.18; if(Math.abs(p-smooth)<.0005)smooth=p;
  var h=rulerEl.clientHeight, k=clamp((smooth-.04)/.88);
  mk.style.transform='translateY('+(-k*h)+'px)';
  alt.textContent=Math.round(k*MAXM);
  var i=Math.min(arts.length-1,Math.floor(clamp((p-.02)/.9)*arts.length));
  if(i!==cur){arts[cur].classList.remove('on');arts[i].classList.add('on');cur=i}
  return Math.abs(p-smooth)>.0005;
}

/* statement: words go from grey to ink */
var st=document.getElementById('stmt'),words=[];
(function walk(n){[].slice.call(n.childNodes).forEach(function(c){
  if(c.nodeType===3){var f=document.createDocumentFragment();c.textContent.split(/(\s+)/).forEach(function(w){
    if(!w)return;if(/^\s+$/.test(w)){f.appendChild(document.createTextNode(w));return}
    var s=document.createElement('span');s.className='w';s.textContent=w;words.push(s);f.appendChild(s)});c.replaceWith(f)}else walk(c)})})(st);
function stmtRun(){
  var r=st.getBoundingClientRect(),vh=innerHeight,a=vh*.85,b=vh*.4;
  var t=clamp((a-r.top)/Math.max(1,(a-b)+r.height)),k=Math.round(t*words.length);
  for(var i=0;i<words.length;i++)words[i].classList.toggle('on',i<k);
}

var band=document.querySelector('.band .ph');
function bandRun(){var r=band.getBoundingClientRect(),t=clamp((innerHeight-r.top)/(innerHeight+r.height));band.style.setProperty('--z',(1.12-.12*t).toFixed(4))}
var ticking=false;
function loop(){hdr();var more=false;if(!rm){more=climbRun();stmtRun();bandRun()}ticking=more;if(more)requestAnimationFrame(loop)}
function kick(){if(!ticking){ticking=true;requestAnimationFrame(loop)}}
addEventListener('scroll',kick,{passive:true});addEventListener('resize',kick);
kick();

/* only one FAQ open at a time */
var qas=[].slice.call(document.querySelectorAll('.qa'));
qas.forEach(function(d){d.addEventListener('toggle',function(){if(d.open)qas.forEach(function(o){if(o!==d)o.open=false})})});

/* form: no backend yet, so it never claims to have sent */
var f=document.getElementById('f'),msg=document.getElementById('msg');
f.querySelectorAll('[required]').forEach(function(i){i.addEventListener('input',function(){i.nextElementSibling.textContent=''})});
f.addEventListener('submit',function(e){e.preventDefault();var first=null;
  f.querySelectorAll('[required]').forEach(function(i){var bad=!i.value.trim()?'Vpišite '+(i.name==='ime'?'ime in priimek.':'e-poštni naslov.'):(i.type==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.value)?'Preverite e-poštni naslov.':'');
    i.nextElementSibling.textContent=bad;if(bad&&!first)first=i});
  if(first){first.focus();return}
  msg.textContent='Obrazec še ni povezan s strežnikom. Pišite nam na info@arcop.si.';});
})();
