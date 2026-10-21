/* No lead submission, no new pixels, no personal-data events. */
(function(){
 'use strict';
 var schedule='https://thepicniccollective.hbportal.co/schedule/66673cf26bf84d002bbb2e10';
 var email='mailto:events@thepicniccollective.com?subject=Holiday%20party%20inquiry';
 document.querySelectorAll('a[href]').forEach(function(a){
  var u=new URL(a.href,location.href);
  if(u.origin===location.origin && u.hash==='#call' && /call|planner|talk|series/i.test(a.textContent)){
   a.href=schedule;a.target=window.self!==window.top?'_top':'_blank';a.rel='noopener';
  }
 });
 // Keep a useful fallback visible without inventing date availability.
 var nav=document.createElement('nav');nav.className='booking-bar';nav.setAttribute('aria-label','Quick contact');
 var gift=location.pathname.indexOf('/gift/')!==-1;
 nav.innerHTML='<a href="'+(gift?'https://thepicniccollective.hbportal.co/public/6ad12a47f1f76d46a37ca581':schedule)+'" target="_blank" rel="noopener">'+(gift?'Buy a gift card':'Book a free call')+'</a><a href="'+email+'">Email inquiry</a><a href="sms:+19492347102">Text us</a><span class="booking-bar-note">'+(gift?'Choose your gift amount at checkout.':'Free 30-minute consultation · event dates confirmed in your proposal')+'</span>';
 document.body.appendChild(nav);
 // An email draft is explicit and never claims the server received the estimate.
 var body=document.getElementById('w-body');
 function updateSummary(){
  if(!body)return;
  var summary=document.getElementById('w-sum');
  body.querySelectorAll('a[href^="mailto:"]').forEach(function(a){
   a.href=email+'&body='+encodeURIComponent(summary?summary.textContent:'Event date:\nLocation:\nGuest count:\nBudget range:\nIdeas:');
  });
 }
 if(body){new MutationObserver(updateSummary).observe(body,{childList:true,subtree:true});updateSummary();}
})();
