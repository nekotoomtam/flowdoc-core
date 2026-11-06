import {it,expect} from 'vitest';
import {createTextRuntime} from '../../src/runtime/textRuntime.js';
import {configurePrefixFit,withPrefixBudget,tryPrefixFit} from '../../src/runtime/prefixFit.js';
import {loadBundledResources} from '../../src/runtime/loadBundledResources.js';
import {measureText} from '../../src/layout/measureText.js';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const native=it.runIf(process.platform==='linux');
const style:any={fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:20};
const node=(text:string):any=>({id:'row',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'leaf',type:'text',text}]});
async function resources(){const r=await loadBundledResources({pythonExecutable:'python',tempRoot:'/tmp'});if(!r.ok)throw Error(JSON.stringify(r));return r.value;}
async function closedWithin(runtime:ReturnType<typeof createTextRuntime>){let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([runtime.close(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Compiler cleanup exceeded two seconds')),2000);})]);}finally{clearTimeout(timer);}}

native('completes1800 equivalent measurements under the original document budget',async()=>{
 const r=await resources(),rt=createTextRuntime(r);let requests=0,units=0;
 const alphabet=' -0123456789CENORSUWbefloru';
 try{
  await configurePrefixFit(rt,r.pythonExecutable,alphabet);
  for(let i=1;i<=1800;i++){
   const n=node('RESOURCE-ROW-'+String(i).padStart(4,'0')+' before-full ไทย EN');let blockUnits=0,blockRequests=0;
   const wrapped=withPrefixBudget(rt,{...rt,shape:async(t,...args)=>{requests++;blockRequests++;units+=t.length;blockUnits+=t.length;if(requests>8192||blockRequests>2048||units>1048576||blockUnits>262144)throw Error('budget');return rt.shape(t,...args);}},work=>{if(units+work>1048576||blockUnits+work>262144)return false;units+=work;blockUnits+=work;return true;});
   const expected=await measureText(n,style,170*72/25.4,{...rt});
   expect(await measureText(n,style,170*72/25.4,wrapped)).toEqual(expected);
  }
  expect(requests).toBeLessThanOrEqual(8192);expect(units).toBeLessThanOrEqual(1048576);
 }finally{await rt.close();}
},120000);

native.each(['abort','close'])('never certifies a prefix after real owner %s',async mode=>{
 const r=await resources(),ac=new AbortController(),rt=createTextRuntime(r,ac.signal);
 try{await configurePrefixFit(rt,r.pythonExecutable,'ab ');if(mode==='abort')ac.abort(Error('cancel'));else await rt.close();await expect(tryPrefixFit(rt,'a','font-regular',12,400,1e-6)).rejects.toThrow('Text runtime closed');}finally{await rt.close();}
});
native('unsupported text and exhausted proof accounting use exact measurements',async()=>{
 const r=await resources(),rt=createTextRuntime(r);
 try{await configurePrefixFit(rt,r.pythonExecutable,'ab ');const wrapped=withPrefixBudget(rt,{...rt},()=>false);expect(await tryPrefixFit(wrapped,'a','font-regular',12,400,1e-6)).toBe(false);const n=node('ไทย ab');expect(await measureText(n,style,30,wrapped)).toEqual(await measureText(n,style,30,{...rt}));}finally{await rt.close();}
});
native('an idle real native process dying cannot be hidden by a certified prefix',async()=>{
 const r=await resources(),dir=await mkdtemp(join(tmpdir(),'prefix-failure-')),pidFile=join(dir,'pid'),wrapper=join(dir,'shaper');
 await writeFile(wrapper,'#!/bin/sh\necho $$ > "'+pidFile+'"\nexec "'+r.shaperPath+'" "$@"\n',{mode:0o700});
 const rt=createTextRuntime({...r,shaperPath:wrapper});
 try{
  await configurePrefixFit(rt,r.pythonExecutable,'ab ');
  await rt.shape('ab','font-regular',12);
  const wrapped=withPrefixBudget(rt,{...rt},()=>true);
  expect(await tryPrefixFit(wrapped,'a','font-regular',12,400,1e-6)).toBe(true);
  process.kill(Number(await readFile(pidFile,'utf8')),'SIGKILL');await delay(100);
  await expect(tryPrefixFit(wrapped,'a','font-regular',12,400,1e-6)).rejects.toThrow();
  await expect(rt.shape('a','font-regular',12)).rejects.toThrow();
 }finally{await rt.close();await rm(dir,{recursive:true,force:true});}
 const fresh=createTextRuntime(r);try{await configurePrefixFit(fresh,r.pythonExecutable,'ab ');expect(await measureText(node('ab'),style,400,withPrefixBudget(fresh,{...fresh},()=>true))).toHaveLength(1);}finally{await fresh.close();}
});
native.each([false,true])('closing during compiler startup waits for the owned child, ignoring TERM: %s',async ignoreTerm=>{
 const r=await resources(),dir=await mkdtemp(join(tmpdir(),'prefix-compile-')),pidFile=join(dir,'pid'),wrapper=join(dir,'compiler');
 await writeFile(wrapper,'#!/usr/bin/env python3\nimport os,time,signal\n'+(ignoreTerm?'signal.signal(signal.SIGTERM,signal.SIG_IGN)\n':'')+'open('+JSON.stringify(pidFile)+',"w").write(str(os.getpid()))\ntime.sleep(60)\n',{mode:0o700});
 const rt=createTextRuntime(r),observed=configurePrefixFit(rt,wrapper,'ab ').then(()=>({ok:true}),error=>({ok:false,error}));let pid=0;
 try{for(let i=0;i<300;i++){try{pid=Number(await readFile(pidFile,'utf8'));break;}catch{await delay(10);}}expect(pid).toBeGreaterThan(0);await closedWithin(rt);expect((await observed).ok).toBe(false);expect(()=>process.kill(pid,0)).toThrow();await expect(tryPrefixFit(rt,'a','font-regular',12,400,1e-6)).rejects.toThrow();}finally{if(pid)try{process.kill(pid,'SIGKILL');}catch{}await rt.close();await observed;await rm(dir,{recursive:true,force:true});}
});
native('failed segmentation cannot leave a usable prefix certificate',async()=>{
 const r=await resources(),rt=createTextRuntime({...r,segmenterPath:'/nonexistent/flowdoc-segmenter'});
 try{await configurePrefixFit(rt,r.pythonExecutable,'ab ');await expect(rt.breaks('ab')).rejects.toThrow();const wrapped=withPrefixBudget(rt,{...rt},()=>true);await expect(tryPrefixFit(wrapped,'a','font-regular',12,400,1e-6)).rejects.toThrow();}finally{await rt.close();}
});
native('abort rejects a pending native request and close reaps its worker',async()=>{
 const r=await resources(),dir=await mkdtemp(join(tmpdir(),'prefix-pending-')),pidFile=join(dir,'pid'),wrapper=join(dir,'shaper');
 await writeFile(wrapper,'#!/usr/bin/env python3\nimport os,time\nopen('+JSON.stringify(pidFile)+',"w").write(str(os.getpid()))\ntime.sleep(60)\n',{mode:0o700});
 const ac=new AbortController(),rt=createTextRuntime({...r,shaperPath:wrapper},ac.signal);
 try{await configurePrefixFit(rt,r.pythonExecutable,'ab ');const observed=rt.shape('ab','font-regular',12).then(()=>({ok:true}),error=>({ok:false,error}));let pid=0;for(let i=0;i<300;i++){try{pid=Number(await readFile(pidFile,'utf8'));break;}catch{await delay(10);}}expect(pid).toBeGreaterThan(0);ac.abort();expect((await observed).ok).toBe(false);await rt.close();expect(()=>process.kill(pid,0)).toThrow();await expect(tryPrefixFit(withPrefixBudget(rt,{...rt},()=>true),'a','font-regular',12,400,1e-6)).rejects.toThrow();}finally{await rt.close();await rm(dir,{recursive:true,force:true});}
});
native('compiler failure conservatively retains native measurement',async()=>{
 const r=await resources(),rt=createTextRuntime(r);
 try{await configurePrefixFit(rt,'/nonexistent/flowdoc-python','ab ');const n=node('ab ab');expect(await measureText(n,style,24,withPrefixBudget(rt,{...rt},()=>true))).toEqual(await measureText(n,style,24,{...rt}));}finally{await rt.close();}
});
