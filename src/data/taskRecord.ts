import type {TaskValue} from './taskInput.js';
/** Optional storage optimization only. The adapter must keep fallback handles valid. */
export async function retainTaskRecord(value:TaskValue){
 return value.retainRecord?value.retainRecord():{value,release(){}};
}
