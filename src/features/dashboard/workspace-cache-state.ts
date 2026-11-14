/** 仅保留当前账号内存中的已成功读取视图；不写 localStorage 或跨账号复用。 */
export function workspaceQuery(params: Record<string, string | string[] | undefined>) {
 const query=new URLSearchParams();
 for(const [key,value] of Object.entries(params)) for(const item of Array.isArray(value)?value:value===undefined?[]:[value]) query.append(key,item);
 query.sort(); return query.toString();
}
export function workspaceCacheKey(path:string,query:string) { const params=new URLSearchParams(query);params.sort();return path+"?"+params.toString(); }
export class WorkspaceCache<T> {
 constructor(private scope=""){}
 private entries=new Map<string,{day:string;value:T}>();
 remember(key:string,day:string,value:T) {const params=new URLSearchParams(key.split("?")[1]);if(params.has("entry")||params.get("intent")==="edit"||params.get("intent")==="create")return;for(const stored of this.entries.keys())if(stored.startsWith(this.scope+key.split("?")[0]+"?"))this.entries.delete(stored);this.entries.set(this.scope+key,{day,value});while(this.entries.size>5)this.entries.delete(this.entries.keys().next().value!);}
 read(key:string,day:string) {const entry=this.entries.get(this.scope+key);return entry?.day===day?entry.value:undefined;}
 clear(){this.entries.clear();}
}
