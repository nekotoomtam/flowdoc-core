export function readUniqueJson(raw:string):unknown {
  const parsed:unknown=JSON.parse(raw);let i=0;
  const ws=()=>{while(/\s/.test(raw[i]??'')&&i<raw.length)i++;};
  const string=()=>{const start=i++;while(i<raw.length){const c=raw[i++];if(c==='\\')i++;else if(c==='"')break;}return JSON.parse(raw.slice(start,i)) as string;};
  const walk=()=>{ws();const c=raw[i];if(c==='"'){string();return;}
   if(c==='{'||c==='['){const end=c==='{'?'}':']',seen=new Set<string>();i++;ws();if(raw[i]===end){i++;return;}
    for(;;){ws();if(c==='{'){const k=string();if(seen.has(k))throw Error('Duplicate key');seen.add(k);ws();i++;}walk();ws();if(raw[i++]===end)return;}
   }
   while(i<raw.length&&!/[\s,\]}]/.test(raw[i]!))i++;
  };walk();return parsed;
}
