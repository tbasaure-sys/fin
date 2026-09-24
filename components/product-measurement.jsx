'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useLanguagePreference} from './language-layer';
import {PRODUCT_EVENTS} from '@/lib/product-events.mjs';
import styles from './product-measurement.module.css';
const key='bls-product-measurement-v1';
function choice(){try{const value=JSON.parse(localStorage.getItem(key));return value&&value.expires>Date.now()?value:null}catch{return null}}
export function ProductMeasurement(){
 const {language}=useLanguagePreference('es'),en=language==='en',path=usePathname();const [consent,setConsent]=useState(null);
 useEffect(()=>setConsent(choice()),[]);
 useEffect(()=>{
  function send(event){
   const current=choice();if(current?.allow!==true||navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true||!PRODUCT_EVENTS.includes(event))return;
   const dedup=`${current.visitor}:${new Date().toISOString().slice(0,10)}:${event}`;
   try{if(sessionStorage.getItem(dedup))return;sessionStorage.setItem(dedup,'sent')}catch{return}
   fetch('/api/product-events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor:current.visitor,event,consent:true}),keepalive:true}).then(r=>{if(!r.ok)sessionStorage.removeItem(dedup)}).catch(()=>{try{sessionStorage.removeItem(dedup)}catch{}});
  }
  const event=path==='/'?'visit':path==='/example'?'example_viewed':path==='/research'?'workspace_opened':null;
  if(event)send(event);
  const handle=e=>send(e.detail);window.addEventListener('bls-product-event',handle);return()=>window.removeEventListener('bls-product-event',handle);
 },[path,consent]);
 function choose(allow){const value={allow,expires:Date.now()+30*86400000,...(allow?{visitor:crypto.randomUUID()}:{})};try{localStorage.setItem(key,JSON.stringify(value));setConsent(value)}catch{setConsent({allow:false})}}
 return <aside aria-label={en?'Optional usage measurement':'Medición opcional de uso'} className={styles.bar} data-no-translate>
  <p className={styles.text}>{consent?.allow?(en?'Optional measurement enabled.':'Medición opcional activada.'):(en?'Help improve BLS Prime with optional usage counts.':'Ayuda a mejorar BLS Prime con conteos opcionales de uso.')} {en?'No tickers, holdings or research text.':'Sin tickers, posiciones ni texto de investigación.'}</p>
  <div className={styles.actions}>
   {consent?.allow?<button type="button" onClick={()=>choose(false)}>{en?'Disable':'Desactivar'}</button>:<><button className={styles.primary} type="button" onClick={()=>choose(true)}>{en?'Allow measurement':'Permitir medición'}</button>{!consent?<button type="button" onClick={()=>choose(false)}>{en?'Not now':'Ahora no'}</button>:null}</>}
   <a href={`/privacy?lang=${language}#usage`}>{en?'Details':'Detalles'}</a>
  </div>
 </aside>;
}
