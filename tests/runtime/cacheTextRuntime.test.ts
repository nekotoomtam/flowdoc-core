import {it,expect,vi} from 'vitest';
import {cacheTextRuntime} from '../../src/runtime/cacheTextRuntime.js';
import {fakeRuntime} from '../helpers/document.js';
it('releases cached values and prevents pending misses from repopulating a disposed cache',async()=>{
 let complete!:(value:number[])=>void;
 const breaks=vi.fn().mockResolvedValueOnce([1]).mockImplementationOnce(()=>new Promise<number[]>(resolve=>{complete=resolve;})).mockResolvedValue([2]);
 const runtime=cacheTextRuntime({shape:fakeRuntime.shape,breaks});
 await runtime.breaks('cached');const pending=runtime.breaks('pending');
 runtime.dispose();runtime.dispose();complete([3]);expect(await pending).toEqual([3]);
 await runtime.breaks('cached');await runtime.breaks('cached');await runtime.breaks('pending');
 expect(breaks).toHaveBeenCalledTimes(5);
});
it('reuses exact font size text and breaks only within its document cache',async()=>{const shape=vi.fn(fakeRuntime.shape),breaks=vi.fn(fakeRuntime.breaks),base={shape,breaks};const a=cacheTextRuntime(base);await a.shape('hello','regular',12);await a.shape('hello','regular',12);expect(shape).toHaveBeenCalledTimes(1);await a.shape('hello','bold',12);await a.shape('hello','regular',13);expect(shape).toHaveBeenCalledTimes(3);await a.breaks('hello');await a.breaks('hello');expect(breaks).toHaveBeenCalledTimes(1);await cacheTextRuntime(base).shape('hello','regular',12);expect(shape).toHaveBeenCalledTimes(4);});
it('returns independent data and does not retain rejected requests',async()=>{const shape=vi.fn(fakeRuntime.shape),a=cacheTextRuntime({shape,breaks:fakeRuntime.breaks});const first=await a.shape('abc','regular',12);first.glyphs[0]!.advancePt=999;expect((await a.shape('abc','regular',12)).glyphs[0]!.advancePt).toBe(5);const bad=vi.fn().mockRejectedValueOnce(Error('failed')).mockResolvedValue([1]);const b=cacheTextRuntime({shape,breaks:bad});await expect(b.breaks('x')).rejects.toThrow();expect(await b.breaks('x')).toEqual([1]);expect(bad).toHaveBeenCalledTimes(2);});
it('evicts within bounded bytes and entry count and skips oversized entries',async()=>{const breaks=vi.fn(fakeRuntime.breaks),a=cacheTextRuntime({shape:fakeRuntime.shape,breaks},{maxBytes:100,maxEntries:1});await a.breaks('a');await a.breaks('b');await a.breaks('a');expect(breaks).toHaveBeenCalledTimes(3);const large='a'.repeat(200);await a.breaks(large);await a.breaks(large);expect(breaks).toHaveBeenCalledTimes(5);});
