import React,{useEffect,useRef,useState} from 'react';
import {useComposer} from '@get-bb/plugin-sdk/app';
import {decodeReference,encodeReference} from './reference.js';
export const GATEWAY_DRAG='application/x-bb-file-gateway-reference';
const DRAG_EVENT='bb-file-gateway-drag-active';
export function beginFileDrag(event:React.DragEvent,hostId:string,path:string,name:string){
 const id=encodeReference({hostId,path});const label=`${name}: ${path}`;
 event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData(GATEWAY_DRAG,JSON.stringify({id,label}));event.dataTransfer.setData('text/plain',JSON.stringify({source:'File Gateway',hostId,path}));
 window.dispatchEvent(new CustomEvent(DRAG_EVENT,{detail:true}));
}
export function endFileDrag(){window.dispatchEvent(new CustomEvent(DRAG_EVENT,{detail:false}));}
export function parseFileDrop(raw:string){if(raw.length>32000)throw new Error('Invalid file reference');const data=JSON.parse(raw);if(typeof data.id!=='string'||typeof data.label!=='string'||data.label.length>5000)throw new Error('Invalid file reference');decodeReference(data.id);return {provider:'files',id:data.id,label:data.label};}
/** Own composer banner supplies the scoped SDK composer; standard textbox semantics locate its input surface. */
export function GatewayDropTarget(){
 const composer=useComposer();const marker=useRef<HTMLDivElement>(null);const [active,setActive]=useState(false);
 useEffect(()=>{
  function root(){let el=marker.current?.parentElement;for(let depth=0;el&&depth<10;depth++,el=el.parentElement){const inputs=el.querySelectorAll('[role="textbox"][contenteditable="true"],textarea');if(inputs.length===1)return el;if(inputs.length>1)return null;}return null;}
  function owns(event:DragEvent){return event.dataTransfer?.types.includes(GATEWAY_DRAG)&&event.target instanceof Node&&root()?.contains(event.target);}
  const over=(event:DragEvent)=>{if(owns(event)){event.preventDefault();event.dataTransfer!.dropEffect='copy';}};
  const drop=(event:DragEvent)=>{if(!owns(event))return;event.preventDefault();event.stopPropagation();try{composer.insertMention(parseFileDrop(event.dataTransfer!.getData(GATEWAY_DRAG)));composer.focus();}catch{/* Ignore malformed external drag payloads. */}setActive(false);};
  const dragging=(event:Event)=>setActive((event as CustomEvent).detail===true);
  const stop=()=>setActive(false);
  document.addEventListener('dragover',over,true);document.addEventListener('drop',drop,true);window.addEventListener(DRAG_EVENT,dragging);window.addEventListener('dragend',stop);
  return()=>{document.removeEventListener('dragover',over,true);document.removeEventListener('drop',drop,true);window.removeEventListener(DRAG_EVENT,dragging);window.removeEventListener('dragend',stop);};
 },[composer]);
 return <div ref={marker} data-file-gateway-drop-target="" className={active?'rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground':'hidden'}>{active?'Перетащите сюда файл или папку':''}</div>;
}
